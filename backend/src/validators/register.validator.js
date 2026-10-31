import { z } from "zod";
import { passwordSchema } from "./password.schema.js";

export const registerSchema = z
  .object({
    businessName: z.string().trim().min(2).max(150),
    name: z.string().trim().min(2).max(150),
    email: z.string().trim().email().max(255).transform(
      (email) => email.toLowerCase()
    ),
    password: passwordSchema,
    phone: z.string().trim().max(30).optional(),
  })
  .strict();
