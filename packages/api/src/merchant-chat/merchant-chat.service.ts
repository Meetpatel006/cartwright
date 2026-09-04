/**
 * Merchant Chat Service
 *
 * Multi-turn conversational AI that lets merchants query their own data.
 * Uses the same AGENT_LLM_* endpoint as the shopping agent, but drives
 * a standard chat-completions flow (no Stagehand, no browser).
 *
 * Each message is persisted so the full history is available for context
 * on subsequent turns.
 */

import { TRPCError } from "@trpc/server";
import { env } from "@cartwright/env/server";

import {
  insertChat,
  getChatForUser,
  listChatsForUser,
  insertMessage,
  listMessagesForChat,
  updateChat,
} from "@cartwright/db/repositories/merchant-chat.repository";

import { getOverview } from "../merchant-intelligence/merchant-intelligence.service";
import { getOrCreateMerchantAccount } from "../merchant-intelligence/merchant-account.service";
import { fetchPostHogContext, formatPostHogContext } from "./posthog-context";
import type { MerchantChatRow } from "@cartwright/db/schema";

// ── Types ──────────────────────────────────────────────────────────────

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

// ── LLM Caller ─────────────────────────────────────────────────────────

function buildEndpointConfig() {
  if (!env.AGENT_LLM_BASE_URL || !env.AGENT_LLM_MODEL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LLM endpoint not configured (AGENT_LLM_BASE_URL / AGENT_LLM_MODEL).",
    });
  }

  const keys = [
    env.AGENT_LLM_API_KEY,
    env.AGENT_LLM_API_KEY_FALLBACK,
  ].filter(Boolean) as string[];

  return {
    baseURL: env.AGENT_LLM_BASE_URL,
    model: env.AGENT_LLM_MODEL,
    keys,
    reasoningEffort: env.AGENT_LLM_REASONING_EFFORT,
    debug: env.AGENT_DEBUG !== undefined,
  };
}

async function callChatLLM(
  messages: LLMMessage[],
): Promise<string> {
  const config = buildEndpointConfig();
  const url = config.baseURL.replace(/\/$/, "").endsWith("/chat/completions")
    ? config.baseURL.replace(/\/$/, "")
    : `${config.baseURL.replace(/\/$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Connection: "close",
  };
  if (config.keys[0]) {
    headers.Authorization = `Bearer ${config.keys[0]}`;
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    ...(config.reasoningEffort && { reasoning_effort: config.reasoningEffort }),
  };

  if (config.debug) {
    console.log(`[merchant-chat] -> POST ${url} model=${config.model}`);
  }

  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `LLM request failed: ${(error as Error).message}`,
    });
  }

  if (config.debug) {
    console.log(
      `[merchant-chat] <- ${response.status} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `LLM returned ${response.status}: ${detail.slice(0, 200)}`,
    });
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };

  return json.choices?.[0]?.message?.content ?? "";
}

// ── Context Builder ────────────────────────────────────────────────────

async function buildMerchantContext(userId: string): Promise<string> {
  const parts: string[] = [];

  // 1. DB Intelligence (shopping sessions + transactions)
  try {
    const overview = await getOverview(userId);
    const { funnel, topProducts, insights } = overview;

    parts.push("## Merchant Intelligence Summary\n");
    parts.push(`Time window: ${overview.timeWindow.start.toLocaleDateString()} — ${overview.timeWindow.end.toLocaleDateString()}\n`);

    parts.push("### Conversion Funnel");
    parts.push(`- Total sessions: ${funnel.counts.sessionsTotal}`);
    parts.push(`- Discovered: ${funnel.counts.discovered}`);
    parts.push(`- Recommended: ${funnel.counts.recommended}`);
    parts.push(`- Selected: ${funnel.counts.selected}`);
    parts.push(`- Purchase requested: ${funnel.counts.purchaseRequested}`);
    parts.push(`- Approved: ${funnel.counts.approved}`);
    parts.push(`- Payment succeeded: ${funnel.counts.paymentSucceeded}`);
    parts.push(`- Policy blocked: ${funnel.counts.policyBlocked}`);
    parts.push(`- Cancelled: ${funnel.counts.cancelled}`);
    parts.push(`- Overall conversion: ${funnel.overallConversionRate != null ? `${(funnel.overallConversionRate * 100).toFixed(1)}%` : "N/A"}`);
    parts.push("");

    if (topProducts.length > 0) {
      parts.push("### Top Products");
      for (const p of topProducts.slice(0, 10)) {
        const amount = `${(p.amountInMinor / 100).toFixed(2)} ${p.currency}`;
        parts.push(
          `- **${p.title}** (${p.merchant ?? "unknown"}) — ${amount} | discovered: ${p.timesDiscovered}, recommended: ${p.timesRecommended}, selected: ${p.timesSelected}, converted: ${p.timesConverted}`,
        );
      }
      parts.push("");
    }

    if (insights.length > 0) {
      parts.push("### Insights");
      for (const i of insights) {
        parts.push(`- [${i.severity}] **${i.title}**: ${i.summary}`);
      }
      parts.push("");
    }
  } catch (error) {
    console.warn(`[merchant-chat] DB intelligence failed: ${(error as Error).message}`);
  }

  // 2. PostHog Live Store Analytics
  try {
    const merchantAccount = await getOrCreateMerchantAccount(userId);
    const posthogData = await fetchPostHogContext(merchantAccount.merchantId);
    if (posthogData) {
      parts.push(formatPostHogContext(posthogData));
    }
  } catch (error) {
    console.warn(`[merchant-chat] PostHog context failed: ${(error as Error).message}`);
  }

  if (parts.length === 0) {
    return "No merchant data available yet. The merchant has not accumulated enough session, transaction, or store activity data for analytics.";
  }

  return parts.join("\n");
}

function buildSystemPrompt(merchantContext: string): string {
  return `You are Cartwright Merchant Assistant — a helpful AI that helps merchants understand their business data, analytics, and customer behavior.

You have access to the merchant's intelligence data (conversion funnel, product performance, insights). Use it to answer questions accurately. Be concise, data-driven, and actionable.

When the merchant asks about specific metrics, reference the actual numbers from the context. When data is insufficient to answer, say so honestly.

${merchantContext}`;
}

// ── Auto-title ─────────────────────────────────────────────────────────

async function generateChatTitle(firstMessage: string): Promise<string> {
  try {
    const title = await callChatLLM([
      {
        role: "system",
        content:
          "Generate a short title (max 6 words) for a chat conversation that starts with this message. Return ONLY the title text, nothing else.",
      },
      { role: "user", content: firstMessage },
    ]);
    return title.trim().slice(0, 80) || "New Chat";
  } catch {
    // Fallback: truncate the first message
    return firstMessage.slice(0, 60).trim() || "New Chat";
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export async function createChat(
  userId: string,
  firstMessage: string,
): Promise<{ chat: MerchantChatRow; messages: ChatMessage[] }> {
  // Generate a title from the first message
  const title = await generateChatTitle(firstMessage);

  const chat = await insertChat({
    id: crypto.randomUUID(),
    userId,
    title,
  });

  // Save user message
  const userMsg = await insertMessage({
    id: crypto.randomUUID(),
    chatId: chat.id,
    role: "user",
    content: firstMessage,
  });

  // Build context + call LLM
  const merchantContext = await buildMerchantContext(userId);
  const systemPrompt = buildSystemPrompt(merchantContext);

  const llmMessages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: firstMessage },
  ];

  const assistantContent = await callChatLLM(llmMessages);

  // Save assistant message
  const assistantMsg = await insertMessage({
    id: crypto.randomUUID(),
    chatId: chat.id,
    role: "assistant",
    content: assistantContent,
  });

  return {
    chat,
    messages: [
      { id: userMsg.id, role: "user", content: userMsg.content, createdAt: userMsg.createdAt },
      { id: assistantMsg.id, role: "assistant", content: assistantMsg.content, createdAt: assistantMsg.createdAt },
    ],
  };
}

export async function sendMessage(
  userId: string,
  chatId: string,
  content: string,
): Promise<ChatMessage[]> {
  const chat = await getChatForUser(chatId, userId);
  if (!chat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found." });
  }

  // Save user message
  const userMsg = await insertMessage({
    id: crypto.randomUUID(),
    chatId,
    role: "user",
    content,
  });

  // Load full history for context
  const history = await listMessagesForChat(chatId);

  // Build LLM messages with system prompt + full history
  const merchantContext = await buildMerchantContext(userId);
  const systemPrompt = buildSystemPrompt(merchantContext);

  const llmMessages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const assistantContent = await callChatLLM(llmMessages);

  // Save assistant message
  const assistantMsg = await insertMessage({
    id: crypto.randomUUID(),
    chatId,
    role: "assistant",
    content: assistantContent,
  });

  // Touch updatedAt on the chat
  await updateChat(chatId, {});

  return [
    { id: userMsg.id, role: "user", content: userMsg.content, createdAt: userMsg.createdAt },
    { id: assistantMsg.id, role: "assistant", content: assistantMsg.content, createdAt: assistantMsg.createdAt },
  ];
}

export async function listChats(userId: string) {
  return listChatsForUser(userId);
}

export async function getChat(userId: string, chatId: string) {
  const chat = await getChatForUser(chatId, userId);
  if (!chat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found." });
  }
  const messages = await listMessagesForChat(chatId);
  return { chat, messages };
}
