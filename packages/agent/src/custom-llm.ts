import type { ClientLLM } from "@browserbasehq/stagehand";

/**
 * Bring-your-own-key adapter for any OpenAI-compatible chat-completions
 * endpoint (OpenRouter, Ollama, LM Studio, Together, Groq, vLLM, ...).
 *
 * Stagehand v4's built-in `model` config only accepts API keys for its five
 * bundled providers, so custom endpoints go through the `ClientLLM` callback,
 * which runs entirely locally ("never crosses the wire").
 */

export interface CustomModelEndpoint {
  /** e.g. "https://openrouter.ai/api/v1", "http://localhost:11434/v1" */
  baseURL: string;
  /** Any model id the endpoint serves, e.g. "meta-llama/llama-3.3-70b-instruct" */
  model: string;
  apiKey?: string;
  /**
   * Fallback API keys. On a retryable failure (401/403/429/5xx/timeout) the
   * adapter rotates to the next key, so a flaky or rate-limited key fails over
   * automatically. `apiKey` (if set) is always tried first.
   */
  apiKeys?: string[];
  headers?: Record<string, string>;
  /** Log every LLM request/response (status, latency, token usage) */
  debug?: boolean;
  /** Extra JSON merged into every request body, e.g. {"chat_template_kwargs":{"enable_thinking":false}} */
  extraBody?: Record<string, unknown>;
  /**
   * Hard cap on tokens to generate. NVIDIA's `integrate.api.nvidia.com`
   * REQUIRES `max_tokens` or it throws a server error / resets the connection,
   * so this always defaults to a sane value (4096) if unset.
   */
  maxTokens?: number;
  /**
   * Per-request client timeout (ms). The NVIDIA gateway 504s slow/large
   * requests after ~302s, so bounding this lets us fail fast and retry.
   */
  timeoutMs?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  [key: string]: unknown;
}

interface GenerateParams {
  messages: { role: "user" | "assistant"; content: ContentBlock | ContentBlock[] }[];
  systemPrompt?: string;
  temperature?: number;
  stopSequences?: string[];
  responseFormat?:
    | { type: "text" }
    | { type: "json_schema"; name: string; description?: string; schema: Record<string, unknown> };
}

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | (
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      )[];
};

function toOpenAIMessages(params: GenerateParams): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }

  for (const message of params.messages) {
    const blocks = Array.isArray(message.content) ? message.content : [message.content];
    const content: Extract<OpenAIMessage["content"], unknown[]> = [];

    for (const block of blocks) {
      if (block.type === "text" && typeof block.text === "string") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "image" && typeof block.data === "string") {
        content.push({
          type: "image_url",
          image_url: { url: `data:${block.mimeType ?? "image/png"};base64,${block.data}` },
        });
      } else {
        // tool_use / tool_result are not needed for act/extract flows;
        // degrade gracefully instead of failing the whole request.
        console.warn(`[custom-llm] ignoring unsupported content block: ${block.type}`);
      }
    }

    const single = content.length === 1 ? content[0] : undefined;
    messages.push({
      role: message.role,
      content: single && single.type === "text" ? single.text : content,
    });
  }

  return messages;
}

function extractJson(text: string): Record<string, unknown> {
  // Strip markdown fences some models wrap around JSON
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to error below
  }
  throw new Error(`[custom-llm] model did not return valid JSON: ${text.slice(0, 200)}`);
}

async function callEndpoint(
  endpoint: CustomModelEndpoint,
  keys: string[],
  keyIndex: number,
  body: Record<string, unknown>,
  retries = 6,
  timeoutMs = endpoint.timeoutMs ?? 300_000,
): Promise<{ content: string; usage?: Record<string, number>; finishReason?: string }> {
  const keyLen = keys.length;
  const apiKey = keyLen ? keys[keyIndex % keyLen] : "";
  const keyTag = keyLen > 1 ? ` [key ${(keyIndex % keyLen) + 1}/${keyLen}]` : "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Force a fresh TCP connection per call so we never silently reuse a
    // socket the gateway may have reset (avoids "socket closed unexpectedly").
    Connection: "close",
    ...endpoint.headers,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  const startedAt = Date.now();
  if (endpoint.debug) {
    console.log(`[custom-llm] -> POST ${endpoint.baseURL}/chat/completions model=${endpoint.model}${keyTag}`);
  }
  try {
    response = await fetch(`${endpoint.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Transient socket/DNS/timeout failures — retry with escalating backoff,
    // rotating to the next API key each attempt so a bad key fails over.
    if (retries > 0) {
      const delayMs = Math.min(5_000 * 2 ** (6 - retries), 60_000);
      console.warn(`[custom-llm] network error (${(error as Error).message})${keyTag}, retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return callEndpoint(endpoint, keys, (keyIndex + 1) % Math.max(keyLen, 1), body, retries - 1, timeoutMs);
    }
    throw error;
  }

  if (endpoint.debug) {
    console.log(
      `[custom-llm] <- ${response.status} ${response.statusText} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    );
  }

  // Free shared pools throw 429/5xx in bursts lasting minutes — retry
  // generously with escalating backoff (5s → 60s, ~2.5 min total patience),
  // rotating the API key each attempt so a rate-limited key fails over.
  if ((response.status === 429 || response.status >= 500) && retries > 0) {
    const delayMs = Math.min(5_000 * 2 ** (6 - retries), 60_000);
    console.warn(
      `[custom-llm] ${response.status} from provider${keyTag}, retry ${7 - retries}/6 in ${delayMs / 1000}s...`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return callEndpoint(endpoint, keys, (keyIndex + 1) % Math.max(keyLen, 1), body, retries - 1);
  }

  // 401/403 → the key itself is rejected; fail over to the next key
  // immediately (short backoff) rather than retrying on the same key.
  if ((response.status === 401 || response.status === 403) && keyLen > 1 && keyIndex % keyLen < keyLen - 1) {
    console.warn(`[custom-llm] ${response.status} with key ${(keyIndex % keyLen) + 1}, failing over to next key...`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return callEndpoint(endpoint, keys, keyIndex + 1, body, retries);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `[custom-llm] ${response.status} ${response.statusText} from ${endpoint.baseURL}: ${detail.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: Record<string, number>;
  };

  if (endpoint.debug && json.usage) {
    console.log(
      `[custom-llm] tokens: prompt=${json.usage.prompt_tokens ?? "?"} completion=${json.usage.completion_tokens ?? "?"}`,
    );
  }

  return {
    content: json.choices?.[0]?.message?.content ?? "",
    usage: json.usage,
    finishReason: json.choices?.[0]?.finish_reason,
  };
}

function mapUsage(usage: Record<string, number> | undefined) {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
  };
}

/**
 * Cheap top-level conformance check against the requested JSON schema.
 * Some models (especially preview/free ones) drop a wrapper level or add
 * stray keys; we detect that so we can ask the model to fix itself.
 */
function findSchemaMismatch(
  parsed: Record<string, unknown>,
  schema: Record<string, unknown>,
): string | null {
  const properties = schema.properties as Record<string, { type?: string }> | undefined;
  const required = (schema.required as string[] | undefined) ?? [];

  for (const key of required) {
    if (!(key in parsed)) return `missing required key "${key}"`;
    if (!properties) continue;

    const expectedType = properties[key]?.type;
    const value = parsed[key];
    const actualType = Array.isArray(value)
      ? "array"
      : value === null
        ? "null"
        : typeof value;

    if (
      typeof expectedType === "string" &&
      actualType !== expectedType &&
      !(expectedType === "number" && actualType === "number")
    ) {
      return `key "${key}" must be ${expectedType}, got ${actualType}`;
    }
  }
  return null;
}

export function createOpenAICompatibleLLM(endpoint: CustomModelEndpoint): ClientLLM {
  return {
    async generate(
      params: GenerateParams,
    ): Promise<{
      role: "assistant";
      content: { type: "text"; text: string }[];
      outputFormat: "text" | "json_schema";
      structuredContent?: Record<string, unknown>;
      stopReason?: string;
      usage?: ReturnType<typeof mapUsage>;
    }> {
      const rf = params.responseFormat;
      const isJsonSchema = rf?.type === "json_schema";
      const schema = isJsonSchema ? (rf!.schema as Record<string, unknown>) : undefined;

      // Resolve the ordered list of keys to try (apiKey first, then apiKeys).
      const keys = endpoint.apiKeys?.length
        ? endpoint.apiKeys
        : endpoint.apiKey
          ? [endpoint.apiKey]
          : [];

      const messages = toOpenAIMessages(params);
      const baseBody: Record<string, unknown> = {
        model: endpoint.model,
        messages,
        // NVIDIA's LLM API requires max_tokens or it throws / resets the conn.
        max_tokens: endpoint.maxTokens ?? 4096,
        ...(params.temperature !== undefined && { temperature: params.temperature }),
        ...(params.stopSequences?.length && { stop: params.stopSequences }),
        ...endpoint.extraBody,
      };

      // ── Plain text (act / free-form) ──────────────────────────────────────
      if (!isJsonSchema || !schema) {
        const result = await callEndpoint(endpoint, keys, 0, baseBody);
        const text = result.content;
        if (endpoint.debug && text) {
          console.log(`[custom-llm] response: ${text.slice(0, 300).replace(/\n/g, " ")}`);
        }
        return {
          role: "assistant",
          content: [{ type: "text", text }],
          outputFormat: "text",
          ...(result.finishReason && { stopReason: result.finishReason }),
          ...(mapUsage(result.usage) && { usage: mapUsage(result.usage) }),
        };
      }

      // ── Structured (extract / act) ───────────────────────────────────────
      // IMPORTANT: Stagehand's act/extract schemas (e.g. the `{action, twoStep}`
      // v4 act shape) are only honoured when we send response_format=json_schema
      // — that is what forces the model to nest fields exactly as Stagehand
      // validates them. So we try json_schema FIRST. json_object / plain-prompt
      // are only fallbacks for endpoints that reject json_schema. NVIDIA is slow
      // on json_schema (~tens of seconds) but it produces correct, conforming
      // output, which is why this must remain the primary path.
      const formats: Array<"json_schema" | "json_object" | "none"> = [
        "json_schema",
        "json_object",
        "none",
      ];

      const buildMessages = (fmt: "json_schema" | "json_object" | "none") =>
        fmt === "none"
          ? [
              ...messages,
              {
                role: "system" as const,
                content:
                  "Respond with ONLY a JSON object conforming to the requested schema. No prose, no markdown fences.",
              },
            ]
          : messages;

      let lastText = "";
      let lastResult: Awaited<ReturnType<typeof callEndpoint>> | undefined;

      for (const fmt of formats) {
        const body: Record<string, unknown> = { ...baseBody, messages: buildMessages(fmt) };
        if (fmt === "json_schema" && rf && rf.type === "json_schema") {
          body.response_format = {
            type: "json_schema",
            json_schema: {
              name: rf.name,
              ...(rf.description && { description: rf.description }),
              schema,
            },
          };
        } else if (fmt === "json_object") {
          body.response_format = { type: "json_object" };
        }

        try {
          const result = await callEndpoint(endpoint, keys, 0, body, 2, 180_000);
          lastText = result.content;
          lastResult = result;

          if (!lastText) {
            console.warn(`[custom-llm] ${fmt} returned empty, trying next format...`);
            continue;
          }
          let parsed: Record<string, unknown>;
          try {
            parsed = extractJson(lastText);
          } catch {
            console.warn(`[custom-llm] ${fmt} returned non-JSON, trying next format...`);
            continue;
          }

          // Self-correction: ask the model to fix shape mismatches.
          let mismatch = findSchemaMismatch(parsed, schema);
          for (let attempt = 0; mismatch && attempt < 2; attempt++) {
            console.warn(`[custom-llm] schema mismatch (${mismatch}) with ${fmt}, correcting...`);
            const corrected = await callEndpoint(
              endpoint,
              keys,
              0,
              {
                ...body,
                messages: [
                  ...buildMessages(fmt),
                  { role: "assistant", content: lastText },
                  {
                    role: "user",
                    content: `Your previous JSON had an invalid shape: ${mismatch}. Respond again with ONLY a valid JSON object conforming exactly to the requested schema at the top level.`,
                  },
                ],
              },
              1,
              180_000,
            );
            lastText = corrected.content;
            lastResult = corrected;
            try {
              parsed = extractJson(lastText);
            } catch {
              break;
            }
            mismatch = findSchemaMismatch(parsed, schema);
          }
          if (mismatch) {
            console.warn(`[custom-llm] ${fmt} still mismatched, trying next format...`);
            continue;
          }

          return {
            role: "assistant",
            content: [{ type: "text", text: lastText }],
            outputFormat: "json_schema",
            structuredContent: parsed,
            ...(lastResult?.finishReason && { stopReason: lastResult.finishReason }),
            ...(mapUsage(lastResult?.usage) && { usage: mapUsage(lastResult?.usage) }),
          };
        } catch (err) {
          console.warn(`[custom-llm] ${fmt} failed: ${(err as Error).message}, trying next format...`);
        }
      }

      throw new Error(`[custom-llm] all response formats failed to produce valid structured output`);
    },
  } as unknown as ClientLLM;
}
