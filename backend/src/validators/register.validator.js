import { z } from "zod";

export const registerSchema = z
  .object({
    businessName: z.string().trim().min(2).max(150),
    name: z.string().trim().min(2).max(150),
    email: z.string().trim().email().max(255).transform(
      (email) => email.toLowerCase()
    ),
    password: z.string().min(8).max(72),
    phone: z.string().trim().max(30).optional(),
  })
  .strict();
  