/**
 * Privacy & PII Sanitizer with Bounded Payload Protection
 *
 * Strips passwords, credit card numbers, CVVs, auth tokens, and sensitive query params.
 * Enforces strict memory and payload size limits:
 * - Max string length: 1,000 characters
 * - Max array items: 50
 * - Max object properties: 50
 * - Max object depth: 4 levels
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /card[_-]?num/i,
  /credit[_-]?card/i,
  /cc[_-]?num/i,
  /cvv/i,
  /cvc/i,
  /expir/i,
  /ssn/i,
  /tax[_-]?id/i,
  /pin/i,
  /bearer/i,
  /otp/i,
  /passcode/i,
  /security[_-]?code/i,
  /iban/i,
  /routing[_-]?num/i,
];

// Regex matching 13 to 19 digit numbers (potential PANs / credit card numbers)
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/;

export const MAX_DEPTH = 4;
export const MAX_STRING_LENGTH = 1000;
export const MAX_ARRAY_LENGTH = 50;
export const MAX_OBJECT_KEYS = 50;

export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (CREDIT_CARD_REGEX.test(trimmed)) return true;
  return false;
}

/**
 * Sanitizes URLs by removing sensitive query parameters.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  try {
    const parsed = new URL(rawUrl, "http://localhost");
    const params = new URLSearchParams(parsed.search);
    const toDelete: string[] = [];

    params.forEach((_val, key) => {
      if (isSensitiveKey(key)) {
        toDelete.push(key);
      }
    });

    toDelete.forEach((key) => params.delete(key));

    parsed.search = params.toString();
    // Return relative or full URL appropriately
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      return parsed.toString();
    }
    return parsed.pathname + (parsed.search ? parsed.search : "") + parsed.hash;
  } catch {
    return rawUrl;
  }
}

/**
 * Recursively sanitizes and bounds an object or array, stripping sensitive keys and values.
 */
export function sanitizeObject<T>(obj: T, depth = 0): T {
  if (depth > MAX_DEPTH || obj === null || typeof obj !== "object") {
    if (typeof obj === "string") {
      if (isSensitiveValue(obj)) {
        return "[REDACTED]" as unknown as T;
      }
      if (obj.length > MAX_STRING_LENGTH) {
        return obj.slice(0, MAX_STRING_LENGTH) as unknown as T;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    const boundedArray = obj.length > MAX_ARRAY_LENGTH ? obj.slice(0, MAX_ARRAY_LENGTH) : obj;
    return boundedArray.map((item) => sanitizeObject(item, depth + 1)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(obj as Record<string, unknown>);
  const boundedEntries = entries.length > MAX_OBJECT_KEYS ? entries.slice(0, MAX_OBJECT_KEYS) : entries;

  for (const [key, value] of boundedEntries) {
    if (isSensitiveKey(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      if (isSensitiveValue(value)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value, depth + 1);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
