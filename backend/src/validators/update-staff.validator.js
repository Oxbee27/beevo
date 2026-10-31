import { z } from "zod";

export const updateStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),

    email: z.string().trim().email().max(255)
      .transform((email) => email.toLowerCase())
      .optional(),

    roleId: z.string().regex(/^\d+$/).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided."
  );
