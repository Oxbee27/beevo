import {
  productInterestParamsSchema,
  updateProductInterestSchema,
} from "../validators/product-interest.validator.js";
import { updateProductInterest } from "../services/product-interest.service.js";

export async function updateProductInterestController(req, res, next) {
  try {
    const params = productInterestParamsSchema.safeParse({
      productId: req.params.productId,
      interestId: req.params.interestId,
    });
    const body = updateProductInterestSchema.safeParse(req.body);

    if (!params.success || !body.success) {
      return res.status(400).json({
        message: "Please provide a valid product interest status.",
      });
    }

    const interest = await updateProductInterest(
      req.user.businessId,
      params.data.productId,
      params.data.interestId,
      body.data.status
    );

    return res.status(200).json({
      message: "Product interest updated successfully.",
      interest,
    });
  } catch (error) {
    next(error);
  }
}
