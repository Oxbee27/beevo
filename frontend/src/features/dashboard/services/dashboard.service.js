import { apiRequest } from '../../../services/api/api-client.js'

export async function getDashboardData() {
  const [summaryResult, enquiriesResult, followUpsResult] =
    await Promise.all([
      apiRequest('/dashboard/summary'),
      apiRequest('/enquiries'),
      apiRequest('/follow-ups/upcoming'),
    ])

  return {
    summary: summaryResult.data.summary,
    enquiries: enquiriesResult.data.enquiries || [],
    followUps: followUpsResult.data.followUps || [],
  }
}
