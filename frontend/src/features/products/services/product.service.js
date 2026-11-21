import { apiRequest } from '../../../services/api/api-client.js'

export async function getProducts(includeArchived = false) {
  const query = includeArchived ? '?includeArchived=true' : ''
  const result = await apiRequest(`/products${query}`)
  return result.data.products || []
}

export async function createProduct(data) {
  const result = await apiRequest('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return result.data.product
}

export async function updateProduct(id, data) {
  const result = await apiRequest(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return result.data
}

export async function archiveProduct(id) {
  return apiRequest(`/products/${id}`, { method: 'DELETE' })
}

export async function getProductInterests(productId) {
  const result = await apiRequest(`/products/${productId}/interests`)
  return result.interests || []
}

export async function addProductInterest(productId, customerId) {
  const result = await apiRequest(`/products/${productId}/interests`, {
    method: 'POST',
    body: JSON.stringify({ customerId: Number(customerId) }),
  })
  return result.interest
}

export async function updateProductInterest(productId, interestId, status) {
  const result = await apiRequest(
    `/products/${productId}/interests/${interestId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  )
  return result.interest
}
