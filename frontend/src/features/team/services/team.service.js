import { apiRequest } from '../../../services/api/api-client.js'

export async function getStaff() {
  const result = await apiRequest('/staff')
  return result.data.staff || []
}

export async function createStaff(data) {
  const result = await apiRequest('/staff', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return result.data.staff
}

export async function updateStaff(id, data) {
  const result = await apiRequest(`/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return result.data.staff
}

export async function updateStaffStatus(id, isActive) {
  const result = await apiRequest(`/staff/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  })
  return result.data.staff
}

export async function getRoles() {
  const result = await apiRequest('/roles')
  return result.data.roles || []
}

export async function getPermissions() {
  const result = await apiRequest('/roles/permissions')
  return result.data.permissions || []
}

export async function createRole(data) {
  const result = await apiRequest('/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return result.data.role
}

export async function updateRole(id, data) {
  const result = await apiRequest(`/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return result.data.role
}

export async function deleteRole(id) {
  return apiRequest(`/roles/${id}`, { method: 'DELETE' })
}
