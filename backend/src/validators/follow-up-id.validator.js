import { z } from "zod";

export const followUpIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
