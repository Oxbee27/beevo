import { z } from "zod";

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(255).transform(
      (email) => email.toLowerCase()
    ),
    password: z.string().min(1).max(72),
  })
  .strict();