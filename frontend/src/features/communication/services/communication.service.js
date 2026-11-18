import { apiRequest } from '../../../services/api/api-client.js'

export async function getCommunicationChannels() {
  const result = await apiRequest('/communications/channels')
  return result.data
}

export async function getCommunicationsOverview() {
  const result = await apiRequest('/communications/overview')
  return result.data
}

export async function getCommunicationMessages(filters = {}) {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  })

  const query = params.toString()
  const result = await apiRequest(
    `/communications/messages${query ? `?${query}` : ''}`,
  )

  return {
    messages: result.data || [],
    pagination: result.pagination || {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
  }
}

export async function getCommunicationMessage(id) {
  const result = await apiRequest(`/communications/messages/${id}`)
  return result.data
}

export async function cancelCommunicationMessage(id) {
  const result = await apiRequest(
    `/communications/messages/${id}/cancel`,
    { method: 'PATCH' },
  )
  return result.data
}

export async function retryCommunicationMessage(id) {
  const result = await apiRequest(
    `/communications/messages/${id}/retry`,
    { method: 'POST' },
  )
  return result.data
}
