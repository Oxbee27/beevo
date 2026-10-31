import { z } from "zod";

export const createRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).optional(),
    permissions: z
      .array(z.string().trim().min(1).max(100))
      .max(50)
      .refine(
        (permissions) => new Set(permissions).size === permissions.length,
        "Duplicate permissions are not allowed."
      ),
  })
  .strict();
