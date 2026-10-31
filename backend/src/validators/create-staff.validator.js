import { z } from "zod";
import { passwordSchema } from "./password.schema.js";

export const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(150),

    email: z.string().trim().email().max(255).transform(
      (email) => email.toLowerCase()
    ),

    password: passwordSchema,

    roleId: z
      .string()
      .regex(/^[1-9]\d*$/, "Please select a valid staff role.")
      .nullable()
      .optional(),
  })
  .strict();
