import { z } from "zod";

export const forgotPasswordSchema = z.object({
  email: z.string()
    .trim()
    .email("Please enter a valid email address.")
    .max(255)
    .transform((email) => email.toLowerCase()),
}).strict();
