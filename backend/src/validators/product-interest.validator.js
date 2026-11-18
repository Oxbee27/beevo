import { z } from "zod";

export const createProductInterestSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  enquiryId: z.coerce.number().int().positive().optional().nullable(),
}).strict();

export const productInterestParamsSchema = z.object({
  productId: z.coerce.number().int().positive(),
  interestId: z.coerce.number().int().positive().optional(),
}).strict();

export const updateProductInterestSchema = z.object({
  status: z.enum(["cancelled", "converted"]),
}).strict();
