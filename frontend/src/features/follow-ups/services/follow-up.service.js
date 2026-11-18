import { apiRequest } from '../../../services/api/api-client.js'

export async function getFollowUps() {
  const result = await apiRequest('/follow-ups')
  return result.data.followUps || []
}

export async function getFollowUp(id) {
  const result = await apiRequest(`/follow-ups/${id}`)
  return result.data.followUp
}

export async function createFollowUp(data) {
  const result = await apiRequest('/follow-ups', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return result.data.followUp
}

export async function updateFollowUp(id, data) {
  const result = await apiRequest(`/follow-ups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return result.data.followUp
}

export async function deleteFollowUp(id) {
  return apiRequest(`/follow-ups/${id}`, { method: 'DELETE' })
}

export async function getFollowUpMessages(id) {
  const result = await apiRequest(`/follow-ups/${id}/messages`)
  return Array.isArray(result.data) ? result.data : []
}

export async function scheduleFollowUpMessage(id, data) {
  const result = await apiRequest(`/follow-ups/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return result.data
}

export async function cancelFollowUpMessage(messageId) {
  const result = await apiRequest(`/follow-ups/messages/${messageId}/cancel`, {
    method: 'PATCH',
  })
  return result.data
}

export async function getStaff() {
  const result = await apiRequest('/staff')
  return result.data.staff || []
}
