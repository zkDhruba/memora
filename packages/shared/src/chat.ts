import { z } from "zod";

export const createConversationBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const sendChatMessageBodySchema = z.object({
  text: z.string().min(1).max(8000),
});

export const messageFeedbackBodySchema = z.object({
  rating: z.number().min(-1).max(1),
  note: z.string().max(2000).optional(),
});

export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;
export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;
export type MessageFeedbackBody = z.infer<typeof messageFeedbackBodySchema>;
