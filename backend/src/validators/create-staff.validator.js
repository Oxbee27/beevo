import { z } from "zod";

export const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(150),

    email: z.string().trim().email().max(255)
      .transform((email) => email.toLowerCase()),

    password: z.string().min(8).max(72),

    roleId: z.string().regex(/^[1-9]\d*$/, "Please select a valid staff role.").nullable().optional(),
  })
  .strict();
