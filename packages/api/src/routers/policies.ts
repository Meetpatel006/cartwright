import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  getEffectivePolicy,
  upsertPolicy,
} from "@cartwright/db/repositories/payment-policy.repository";

export const policiesRouter = router({
  /** Read the user's currently effective payment policy. */
  get: protectedProcedure.query(async ({ ctx }) => {
    return getEffectivePolicy(ctx.session.user.id);
  }),

  /**
   * Create or update the user's payment policy. This is the only way a user
   * defines their own spending boundaries:
   *   - maxTransactionAmount (per-transaction cap, minor units)
   *   - maxTotalSpending (lifetime/reserved + settled cap, minor units)
   *   - currency
   *   - requireUserApproval (force an explicit approve step for every purchase)
   *   - blockedMerchants (deny list; all other merchants are allowed)
   *   - frequencyLimit (max approvals per rolling hour)
   */
  update: protectedProcedure
    .input(
      z.object({
        maxTransactionAmount: z.number().int().positive(),
        maxTotalSpending: z.number().int().positive(),
        currency: z.string().length(3),
        requireUserApproval: z.boolean().optional(),
        blockedMerchants: z.array(z.string()).optional(),
        frequencyLimit: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return upsertPolicy(ctx.session.user.id, input);
    }),
});
