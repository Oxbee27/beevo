
import { z } from "zod";

export const createEnquirySchema = z
  .object({
    customerId: z.coerce.number().int().positive(),
    subject: z.string().trim().min(2).max(200),
    description: z.string().trim().max(3000).optional(),
    source: z.string().trim().max(50).optional(),
    status: z
      .enum(["new", "contacted", "qualified", "converted", "lost"])
      .optional(),
    estimatedValue: z.coerce.number().finite().min(0).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .strict();
