import { z } from "zod";

export const updateFollowUpSchema = z
  .object({
    enquiryId: z.coerce.number().int().positive().optional(),
    assignedTo: z.coerce.number().int().positive().nullable().optional(),
    note: z.string().trim().min(1).max(2000).optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    status: z.enum(["pending", "completed", "cancelled"]).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });
