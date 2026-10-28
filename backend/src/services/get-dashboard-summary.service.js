import pool from "../config/database.js";

export async function getDashboardSummary(businessId) {
  const result = await pool.query(
    `SELECT
      (
        SELECT COUNT(*)::int
        FROM customers
        WHERE business_id = $1
      ) AS total_customers,

      (
        SELECT COUNT(*)::int
        FROM enquiries
        WHERE business_id = $1
      ) AS total_enquiries,

      (
        SELECT COUNT(*)::int
        FROM enquiries
        WHERE business_id = $1 AND status = 'new'
      ) AS new_enquiries,

      (
        SELECT COUNT(*)::int
        FROM enquiries
        WHERE business_id = $1 AND status = 'contacted'
      ) AS contacted_enquiries,

      (
        SELECT COUNT(*)::int
        FROM enquiries
        WHERE business_id = $1 AND status = 'qualified'
      ) AS qualified_enquiries,

      (
        SELECT COUNT(*)::int
        FROM enquiries
        WHERE business_id = $1 AND status = 'converted'
      ) AS converted_enquiries,

      (
        SELECT COUNT(*)::int
        FROM enquiries
        WHERE business_id = $1 AND status = 'lost'
      ) AS lost_enquiries,

      (
        SELECT COUNT(*)::int
        FROM follow_ups
        WHERE business_id = $1 AND status = 'pending'
      ) AS pending_follow_ups,

      (
        SELECT COUNT(*)::int
        FROM follow_ups
        WHERE business_id = $1
          AND status = 'pending'
          AND due_at < CURRENT_TIMESTAMP
      ) AS overdue_follow_ups,

      COALESCE(
        (
          SELECT SUM(estimated_value)
          FROM enquiries
          WHERE business_id = $1 AND status = 'converted'
        ),
        0
      ) AS converted_estimated_value`,
    [businessId]
  );

  const summary = result.rows[0];

  return {
    totalCustomers: summary.total_customers,
    totalEnquiries: summary.total_enquiries,

    enquiriesByStatus: {
      new: summary.new_enquiries,
      contacted: summary.contacted_enquiries,
      qualified: summary.qualified_enquiries,
      converted: summary.converted_enquiries,
      lost: summary.lost_enquiries,
    },

    pendingFollowUps: summary.pending_follow_ups,
    overdueFollowUps: summary.overdue_follow_ups,
    convertedEstimatedValue: summary.converted_estimated_value,
  };
}
