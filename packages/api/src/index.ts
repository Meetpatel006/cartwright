import { initTRPC, TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";

import type { Context } from "./context";
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
 */
function getErrorCode(error: unknown): string | undefined {
  if (error instanceof Error) {
    const code = (error as unknown as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function mapErrorCode(error: unknown): TRPC_ERROR_CODE_KEY {
  const code = getErrorCode(error);
  if (code && DOMAIN_ERROR_CODES.has(code)) {
    return DOMAIN_TO_TRPC[code] ?? "BAD_REQUEST";
  }
  return "INTERNAL_SERVER_ERROR";
}

export const t = initTRPC.context<Context>().create({
  errorFormatter({ error, shape }) {
    const cause = error.cause;
    const causeCode = getErrorCode(cause);
    if (causeCode && DOMAIN_ERROR_CODES.has(causeCode)) {
      const code = mapErrorCode(cause);
      return {
        ...shape,
        message: cause instanceof Error ? cause.message : shape.message,
        data: { ...shape.data, code },
      };
    }
    return shape;
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
