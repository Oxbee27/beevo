
import { z } from "zod";

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    email: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((email) => email.toLowerCase())
      .optional()
      .or(z.literal("")),
    phone: z.string().trim().max(30).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "Provide at least one field to update." }
  );
