
import { customerIdSchema } from "../validators/customer-id.validator.js";
import { updateCustomerSchema } from "../validators/update-customer.validator.js";
import { updateCustomer } from "../services/update-customer.service.js";

export async function updateCustomerController(req, res, next) {
  try {
    const idValidation = customerIdSchema.safeParse(req.params);

    if (!idValidation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const bodyValidation = updateCustomerSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer update data.",
        errors: bodyValidation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const customer = await updateCustomer(
      req.user.businessId,
      idValidation.data.id,
      bodyValidation.data
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer updated successfully.",
      data: { customer },
    });
  } catch (error) {
    next(error);
  }
}
