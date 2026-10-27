
import { customerIdSchema } from "../validators/customer-id.validator.js";
import { deleteCustomer } from "../services/delete-customer.service.js";

export async function deleteCustomerController(req, res, next) {
  try {
    const validation = customerIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const deleted = await deleteCustomer(
      req.user.businessId,
      validation.data.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer deleted successfully.",
    });
  } catch (error) {
    if (error.code === "23503") {
      error.status = 409;
      error.message =
        "This customer cannot be deleted because they have related records.";
    }

    next(error);
  }
}
