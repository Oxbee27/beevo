
import { z } from "zod";

export const customerIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
