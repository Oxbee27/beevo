import { z } from "zod";

export const followUpMessageIdSchema = z.coerce.number().int().positive();

export const scheduleFollowUpMessageSchema = z
  .object({
    channel: z.enum(["email", "sms", "whatsapp"]),
    subject: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(10000),
    scheduledFor: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().trim().min(8).max(150).optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.channel === "email" && !data.subject) {
      context.addIssue({
        code: "custom",
        path: ["subject"],
        message: "A subject is required for email messages.",
      });
    }

    if (data.channel !== "email" && data.subject !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["subject"],
        message: "A subject is only supported for email messages.",
      });
    }
  });
