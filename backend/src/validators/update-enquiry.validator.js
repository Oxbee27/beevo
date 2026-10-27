
import { z } from "zod";

export const updateEnquirySchema = z
  .object({
    customerId: z.coerce.number().int().positive().optional(),
    subject: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(3000).optional(),
    source: z.string().trim().max(100).optional(),
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
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "Provide at least one field to update." }
  );
