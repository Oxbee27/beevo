import { listProducts } from "../services/product.service.js";

export async function listProductsController(req, res, next) {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const products = await listProducts(req.user.businessId, includeArchived);

    return res.status(200).json({
      success: true,
      message: "Products retrieved successfully.",
      data: { products, count: products.length },
    });
  } catch (error) {
    next(error);
  }
}
