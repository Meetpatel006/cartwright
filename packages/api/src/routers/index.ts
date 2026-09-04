import { protectedProcedure, publicProcedure, router } from "../index";

import { merchantChatRouter } from "./merchant-chat";
import { merchantIntelligenceRouter } from "./merchant-intelligence";
import { policiesRouter } from "./policies";
import { shoppingRouter } from "./shopping";
import { transactionsRouter } from "./transactions";

export const appRouter = router({
  policies: policiesRouter,
  shopping: shoppingRouter,
  transactions: transactionsRouter,
  merchantIntelligence: merchantIntelligenceRouter,
  merchantChat: merchantChatRouter,
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
