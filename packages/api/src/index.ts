import { initTRPC, TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";

import type { Context } from "./context";
import { classifyError, getErrorCode } from "./audit/failure-taxonomy";
import { DOMAIN_ERROR_CODES } from "./transactions/transaction.errors";

const DOMAIN_TO_TRPC: Record<string, TRPC_ERROR_CODE_KEY> = {
  TRANSACTION_NOT_FOUND: "NOT_FOUND",
  OWNERSHIP: "FORBIDDEN",
  INVALID_STATE: "PRECONDITION_FAILED",
  POLICY_VIOLATION: "FORBIDDEN",
  ALREADY_PROCESSED: "CONFLICT",
  DUPLICATE_PAYMENT: "CONFLICT",
  VERIFICATION_FAILED: "BAD_REQUEST",
  PRICE_CHANGED: "PRECONDITION_FAILED",
};

/**
 * Map thrown domain errors to tRPC responses. The original message is surfaced
 * (it is safe — no secrets/stack traces) and internal errors stay generic.
 * Uses the failure taxonomy to determine the appropriate error code.
 */
function mapErrorCode(error: unknown): TRPC_ERROR_CODE_KEY {
  const code = getErrorCode(error);
  if (code && DOMAIN_ERROR_CODES.has(code)) {
    return DOMAIN_TO_TRPC[code] ?? "BAD_REQUEST";
  }
  // For errors without a domain code, use the failure taxonomy to map.
  const classification = classifyError(error);
  if (classification.httpStatus === 400) return "BAD_REQUEST";
  if (classification.httpStatus === 401) return "UNAUTHORIZED";
  if (classification.httpStatus === 403) return "FORBIDDEN";
  if (classification.httpStatus === 404) return "NOT_FOUND";
  if (classification.httpStatus === 408) return "TIMEOUT";
  if (classification.httpStatus === 409) return "CONFLICT";
  if (classification.httpStatus === 410) return "NOT_FOUND";
  if (classification.httpStatus === 429) return "TOO_MANY_REQUESTS";
  return "INTERNAL_SERVER_ERROR";
}

export const t = initTRPC.context<Context>().create({
  errorFormatter({ error, shape }) {
    const cause = error.cause;
    const causeCode = getErrorCode(cause);
    // Map through domain error codes first, then fallback to taxonomy.
    if (causeCode && DOMAIN_ERROR_CODES.has(causeCode)) {
      const code = mapErrorCode(cause);
      return {
        ...shape,
        message: cause instanceof Error ? cause.message : shape.message,
        data: { ...shape.data, code },
      };
    }
    // Sanitize: never expose internal error details to the client.
    const classification = classifyError(cause);
    if (classification.code !== "INTERNAL_FAILURE") {
      return {
        ...shape,
        message: classification.userMessage,
        data: { ...shape.data, code: classification.code },
      };
    }
    return {
      ...shape,
      message: "An internal error occurred.",
      data: { ...shape.data, code: "INTERNAL_FAILURE" },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});
