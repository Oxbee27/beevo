import {
  productInterestParamsSchema,
} from "../validators/product-interest.validator.js";
import { z } from "zod";
import { listProductInterests } from "../services/product-interest.service.js";

const querySchema = z.object({
  status: z.enum(["waiting", "notified", "cancelled", "converted"]).optional(),
}).strict();

export async function listProductInterestsController(req, res, next) {
  try {
    const params = productInterestParamsSchema.safeParse({
      productId: req.params.productId,
    });
    const query = querySchema.safeParse(req.query);

    if (!params.success || !query.success) {
      return res.status(400).json({
        message: "The product interest filter is invalid.",
      });
    }

    const interests = await listProductInterests(
      req.user.businessId,
      params.data.productId,
      query.data.status
    );

    return res.status(200).json({
      interests,
      count: interests.length,
    });
  } catch (error) {
    next(error);
  }
}
