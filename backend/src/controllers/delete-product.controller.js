import { productIdSchema } from "../validators/product.validator.js";
import { archiveProduct } from "../services/product.service.js";

export async function deleteProductController(req, res, next) {
  try {
    const validation = productIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid product ID.",
      });
    }

    const product = await archiveProduct(
      req.user.businessId,
      validation.data.id,
    );

    return res.status(200).json({
      success: true,
      message: "Product archived successfully.",
      data: { product },
    });
  } catch (error) {
    next(error);
  }
}
