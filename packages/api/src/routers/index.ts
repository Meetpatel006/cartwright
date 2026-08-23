import { protectedProcedure, publicProcedure, router } from "../index";

import { agentRouter } from "./agent";
import { policiesRouter } from "./policies";
import { transactionsRouter } from "./transactions";

export const appRouter = router({
  agent: agentRouter,
  policies: policiesRouter,
  transactions: transactionsRouter,
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
});
export type AppRouter = typeof appRouter;
