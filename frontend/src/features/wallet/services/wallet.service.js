import { apiRequest } from '../../../services/api/api-client.js'

export async function getBusinessWallet() {
  const result = await apiRequest('/wallet')
  return result.data.wallet
}

export async function getWalletTransactions(page = 1, limit = 20) {
  const result = await apiRequest(`/wallet/transactions?page=${page}&limit=${limit}`)
  return result.data
}

export async function initializeWalletFunding(data) {
  const result = await apiRequest('/wallet/funding/initialize', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return result.data.checkout
}

export async function verifyWalletFunding(reference) {
  const result = await apiRequest('/wallet/funding/verify', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  })
  return result.data.funding
}
