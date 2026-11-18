const TOKEN_KEY = 'beevo_token'

export const tokenStorage = {
  get() {
    return sessionStorage.getItem(TOKEN_KEY)
  },

  set(token) {
    sessionStorage.setItem(TOKEN_KEY, token)
  },

  clear() {
    sessionStorage.removeItem(TOKEN_KEY)
  },
}
