import { z } from "zod";

export const updateStaffStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();
