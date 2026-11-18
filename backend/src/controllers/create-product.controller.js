import { createProductSchema } from "../validators/product.validator.js";
import { createProduct } from "../services/product.service.js";

export async function createProductController(req, res, next) {
  try {
    const validation = createProductSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "We couldn't create this product. Please check the information and try again.",
        errors: validation.error.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const product = await createProduct(
      req.user.businessId,
      validation.data,
    );

    return res.status(201).json({
      success: true,
      message: "Product created successfully.",
      data: { product },
    });
  } catch (error) {
    next(error);
  }
}
