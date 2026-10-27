
import { createCustomerSchema } from "../validators/create-customer.validator.js";
import { createCustomer } from "../services/create-customer.service.js";

export async function createCustomerController(req, res, next) {
  try {
    const validation = createCustomerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer data.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const customer = await createCustomer(
      req.user.businessId,
      validation.data
    );

    return res.status(201).json({
      success: true,
      message: "Customer created successfully.",
      data: { customer },
    });
  } catch (error) {
    next(error);
  }
}
