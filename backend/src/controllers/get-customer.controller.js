
import { customerIdSchema } from "../validators/customer-id.validator.js";
import { getCustomer } from "../services/get-customer.service.js";

export async function getCustomerController(req, res, next) {
  try {
    const validation = customerIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid customer ID.",
      });
    }

    const customer = await getCustomer(
      req.user.businessId,
      validation.data.id
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "We couldn't find this customer.",
      });
    }

    return res.status(200).json({
      success: true,
      data: { customer },
    });
  } catch (error) {
    next(error);
  }
}
