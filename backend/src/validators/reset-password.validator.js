import { z } from "zod";
import { passwordSchema } from "./password.schema.js";

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Your password reset link is invalid."),
  newPassword: passwordSchema,
}).strict();
