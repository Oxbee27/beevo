import {
  productIdSchema,
  updateProductSchema,
} from "../validators/product.validator.js";
import { updateProduct } from "../services/product.service.js";

export async function updateProductController(req, res, next) {
  try {
    const idValidation = productIdSchema.safeParse(req.params);
    const bodyValidation = updateProductSchema.safeParse(req.body);

    if (!idValidation.success || !bodyValidation.success) {
      const issues = [
        ...(idValidation.success ? [] : idValidation.error.issues),
        ...(bodyValidation.success ? [] : bodyValidation.error.issues),
      ];

      return res.status(400).json({
        success: false,
        message: "We couldn't update this product. Please check the information and try again.",
        errors: issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await updateProduct(
      req.user.businessId,
      idValidation.data.id,
      bodyValidation.data,
    );

    return res.status(200).json({
      success: true,
      message: result.restockCampaign
        ? "Product updated and restock campaign created successfully."
        : "Product updated successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
