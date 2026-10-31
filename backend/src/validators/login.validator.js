import { z } from "zod";
import { passwordSchema } from "./password.schema.js";

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(255).transform(
      (email) => email.toLowerCase()
    ),
    password: passwordSchema,
  })
  .strict();
