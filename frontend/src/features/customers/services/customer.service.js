import { apiRequest } from '../../../services/api/api-client.js'

export async function getCustomers() {
  const result = await apiRequest('/customers')
  return result.data.customers || []
}

export async function getCustomer(id) {
  const result = await apiRequest(`/customers/${id}`)
  return result.data.customer
}

export async function createCustomer(customerData) {
  const result = await apiRequest('/customers', {
    method: 'POST',
    body: JSON.stringify(customerData),
  })

  return result.data.customer
}

export async function updateCustomer(id, customerData) {
  const result = await apiRequest(`/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(customerData),
  })

  return result.data.customer
}

export async function deleteCustomer(id) {
  return apiRequest(`/customers/${id}`, { method: 'DELETE' })
}

export async function getCustomerCommunicationPreferences(id) {
  const result = await apiRequest(`/customers/${id}/communication-preferences`)
  return result.data.preferences || []
}

export async function updateCustomerCommunicationPreference(id, preference) {
  const result = await apiRequest(`/customers/${id}/communication-preferences`, {
    method: 'PUT',
    body: JSON.stringify(preference),
  })

  return result.data.preference
}
