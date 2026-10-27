
import { listCustomers } from "../services/list-customers.service.js";

export async function listCustomersController(req, res, next) {
  try {
    const customers = await listCustomers(req.user.businessId);

    return res.status(200).json({
      success: true,
      count: customers.length,
      data: { customers },
    });
  } catch (error) {
    next(error);
  }
}
