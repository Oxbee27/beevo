import { z } from "zod";

const productFields = {
  name: z.string().trim().min(2).max(180),
  sku: z.string().trim().max(100).transform(v => v || null).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  stockQuantity: z.number().int().min(0).max(2147483647),
};

export const createProductSchema = z.object({
  ...productFields,
  stockQuantity: productFields.stockQuantity.default(0),
}).strict();

export const updateProductSchema = z.object({
  name: productFields.name.optional(),
  sku: productFields.sku,
  description: productFields.description,
  stockQuantity: productFields.stockQuantity.optional(),
}).strict().refine(
  data => Object.keys(data).length > 0,
  { message: "Provide at least one field to update." }
);

export const productIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
