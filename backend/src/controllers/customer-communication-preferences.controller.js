import { customerIdSchema } from "../validators/customer-id.validator.js";
import {
  updateCustomerCommunicationPreferenceSchema,
} from "../validators/customer-communication-preference.validator.js";

import {
  getCustomerCommunicationPreferences,
} from "../services/get-customer-communication-preferences.service.js";

import {
  updateCustomerCommunicationPreference,
} from "../services/update-customer-communication-preference.service.js";

export async function getCustomerCommunicationPreferencesController(
  req,
  res,
  next
) {
  try {
    const validation = customerIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid customer ID.",
      });
    }

    const preferences = await getCustomerCommunicationPreferences(
      req.user.businessId,
      validation.data.id
    );

    if (!preferences) {
      return res.status(404).json({
        success: false,
        message: "We couldn't find this customer.",
      });
    }

    return res.status(200).json({
      success: true,
      data: { preferences },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCustomerCommunicationPreferencesController(
  req,
  res,
  next
) {
  try {
    console.log("COMMUNICATION PREFERENCE PUT CONTROLLER REACHED", {
      customerId: req.params.id,
      businessId: req.user?.businessId,
      body: req.body,
    });

    const idValidation = customerIdSchema.safeParse(req.params);

    if (!idValidation.success) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid customer ID.",
      });
    }

    const bodyValidation =
      updateCustomerCommunicationPreferenceSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        success: false,
        message: "We couldn't update this communication preference. Please check the information and try again.",
        errors: bodyValidation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const preference = await updateCustomerCommunicationPreference(
      req.user.businessId,
      idValidation.data.id,
      bodyValidation.data
    );

    if (!preference) {
      return res.status(404).json({
        success: false,
        message: "We couldn't find this customer.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer communication preference updated successfully.",
      data: { preference },
    });
  } catch (error) {
    next(error);
  }
}
