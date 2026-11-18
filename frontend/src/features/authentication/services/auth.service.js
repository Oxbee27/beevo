import { apiRequest } from '../../../services/api/api-client.js'
import { tokenStorage } from '../../../services/storage/token-storage.js'

export async function loginService(credentials) {
  const result = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })

  tokenStorage.set(result.data.token)

  return result.data.user
}

export async function registerService(details) {
  const result = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(details),
  })

  return result.data
}

export async function getCurrentUserService() {
  const result = await apiRequest('/auth/me')
  return result.data.user
}

export async function logoutService() {
  tokenStorage.clear()
}
