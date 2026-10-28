import { z } from "zod";

export const createFollowUpSchema = z
  .object({
    enquiryId: z.coerce.number().int().positive(),
    assignedTo: z.coerce.number().int().positive().optional(),
    note: z.string().trim().min(1).max(2000),
    dueAt: z.string().datetime({ offset: true }),
    status: z.enum(["pending", "completed", "cancelled"]).optional(),
  })
  .strict();
