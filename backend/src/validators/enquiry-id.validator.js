
import { z } from "zod";

export const enquiryIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
