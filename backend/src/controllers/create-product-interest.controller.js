import {
  createProductInterestSchema,
  productInterestParamsSchema,
} from "../validators/product-interest.validator.js";
import { createProductInterest } from "../services/product-interest.service.js";

export async function createProductInterestController(req, res, next) {
  try {
    const params = productInterestParamsSchema.safeParse({
      productId: req.params.productId,
    });

    const body = createProductInterestSchema.safeParse(req.body);

    if (!params.success || !body.success) {
      return res.status(400).json({
        message: "Please provide a valid customer and product interest.",
      });
    }

    const interest = await createProductInterest(
      req.user.businessId,
      params.data.productId,
      body.data
    );

    return res.status(201).json({
      message: "Customer added to the product waiting list successfully.",
      interest,
    });
  } catch (error) {
    next(error);
  }
}
