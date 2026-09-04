import { z } from "zod";
import { router, protectedProcedure } from "../index";
import {
  createChat,
  sendMessage,
  listChats,
  getChat,
} from "../merchant-chat/merchant-chat.service";

export const merchantChatRouter = router({
  /** Create a new chat with the first message and get the AI response. */
  create: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1, "Message cannot be empty."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createChat(ctx.session.user.id, input.message);
    }),

  /** Send a message in an existing chat and get the AI response. */
  send: protectedProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        message: z.string().min(1, "Message cannot be empty."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return sendMessage(ctx.session.user.id, input.chatId, input.message);
    }),

  /** List all chats for the current user (newest first). */
  list: protectedProcedure.query(async ({ ctx }) => {
    return listChats(ctx.session.user.id);
  }),

  /** Get a single chat with its full message history. */
  get: protectedProcedure
    .input(z.object({ chatId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return getChat(ctx.session.user.id, input.chatId);
    }),
});
