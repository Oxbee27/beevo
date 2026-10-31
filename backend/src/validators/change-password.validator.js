import { z } from "zod";
import { passwordSchema } from "./password.schema.js";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Please enter your current password."),
  newPassword: passwordSchema,
}).strict().refine(
  (data) => data.currentPassword !== data.newPassword,
  {
    message: "Your new password must be different from your current password.",
    path: ["newPassword"],
  }
);
