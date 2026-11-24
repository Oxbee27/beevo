let sdkPromise

export function loadMetaEmbeddedSignupSdk(appId) {
  if (!appId) {
    return Promise.reject(new Error('Meta App ID is not configured.'))
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new Error('Meta signup is only available in a browser.'),
    )
  }

  if (window.FB) {
    try {
      if (window.__beevoMetaAppId !== appId) {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: 'v27.0',
        })

        window.__beevoMetaAppId = appId
      }

      return Promise.resolve(window.FB)
    } catch {
      return Promise.reject(
        new Error('Unable to initialise the Meta signup service.'),
      )
    }
  }

  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    let settled = false
    let script
    let timeoutId

    const previousCallback = window.fbAsyncInit

    const cleanup = () => {
      clearTimeout(timeoutId)

      if (script) {
        script.removeEventListener('load', handleLoad)
        script.removeEventListener('error', handleError)
      }

      if (window.fbAsyncInit === initialize) {
        if (previousCallback) {
          window.fbAsyncInit = previousCallback
        } else {
          delete window.fbAsyncInit
        }
      }
    }

    const fail = (message, removeScript = false) => {
      if (settled) return

      settled = true
      cleanup()

      if (removeScript && script?.parentNode) {
        script.parentNode.removeChild(script)
      }

      reject(new Error(message))
    }

    const initialize = () => {
      if (settled) return

      if (!window.FB) {
        fail('Unable to initialise the Meta signup service.', true)
        return
      }

      try {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: 'v27.0',
        })

        window.__beevoMetaAppId = appId
        settled = true
        cleanup()
        resolve(window.FB)
      } catch {
        fail('Unable to initialise the Meta signup service.')
      }
    }

    const handleLoad = () => {
      if (script) {
        script.dataset.beevoLoadState = 'loaded'
      }

      initialize()
    }

    const handleError = () => {
      fail(
        'Unable to load Meta signup. Check your internet connection.',
        true,
      )
    }

    window.fbAsyncInit = initialize

    script = document.getElementById('facebook-jssdk')

    if (script) {
      script.addEventListener('load', handleLoad, { once: true })
      script.addEventListener('error', handleError, { once: true })

      if (
        script.dataset.beevoLoadState === 'loaded' ||
        script.readyState === 'complete'
      ) {
        fail('Unable to initialise the Meta signup service.', true)
        return
      }

      if (window.FB) initialize()
    } else {
      script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.async = true
      script.defer = true
      script.crossOrigin = 'anonymous'
      script.src = 'https://connect.facebook.net/en_US/sdk.js'

      script.addEventListener('load', handleLoad, { once: true })
      script.addEventListener('error', handleError, { once: true })

      document.head.appendChild(script)
    }

    timeoutId = setTimeout(() => {
      fail('Meta signup took too long to load. Please try again.', true)
    }, 15000)
  })

  const currentPromise = sdkPromise

  currentPromise.catch(() => {
    if (sdkPromise === currentPromise) {
      sdkPromise = undefined
    }
  })

  return currentPromise
}
