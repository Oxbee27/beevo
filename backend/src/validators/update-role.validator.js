import { z } from "zod";

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),

    description: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .optional(),

    permissions: z
      .array(z.string().trim().min(1).max(100))
      .max(50)
      .refine(
        (permissions) => new Set(permissions).size === permissions.length,
        "Duplicate permissions are not allowed."
      )
      .optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided."
  );
