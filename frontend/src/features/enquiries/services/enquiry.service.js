import { apiRequest } from '../../../services/api/api-client.js'

export async function getEnquiries() {
  const result = await apiRequest('/enquiries')
  return result.data.enquiries || []
}

export async function createEnquiry(enquiryData) {
  const result = await apiRequest('/enquiries', {
    method: 'POST',
    body: JSON.stringify(enquiryData),
  })
  return result.data.enquiry
}

export async function getEnquiry(id) {
  const result = await apiRequest(`/enquiries/${id}`)
  return result.data.enquiry
}

export async function updateEnquiry(id, enquiryData) {
  const result = await apiRequest(`/enquiries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(enquiryData),
  })
  return result.data.enquiry
}

export async function deleteEnquiry(id) {
  return apiRequest(`/enquiries/${id}`, { method: 'DELETE' })
}
