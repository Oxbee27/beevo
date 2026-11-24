import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('loadMetaEmbeddedSignupSdk', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()

    document.head.innerHTML = ''

    delete window.FB
    delete window.fbAsyncInit
    delete window.__beevoMetaAppId
  })

  async function getLoader() {
    return import('./meta-embedded-signup.js')
  }

  it('rejects when the Meta App ID is missing', async () => {
    const { loadMetaEmbeddedSignupSdk } = await getLoader()

    await expect(loadMetaEmbeddedSignupSdk()).rejects.toThrow(
      'Meta App ID is not configured.',
    )
  })

  it('loads and initializes the SDK', async () => {
    const { loadMetaEmbeddedSignupSdk } = await getLoader()
    const promise = loadMetaEmbeddedSignupSdk('test-app-id')
    const script = document.getElementById('facebook-jssdk')
    const init = vi.fn()

    expect(script).not.toBeNull()
    expect(script.src).toContain('connect.facebook.net')

    window.FB = { init }
    window.fbAsyncInit()

    await expect(promise).resolves.toBe(window.FB)

    expect(init).toHaveBeenCalledWith({
      appId: 'test-app-id',
      autoLogAppEvents: true,
      xfbml: false,
      version: 'v27.0',
    })
    expect(window.__beevoMetaAppId).toBe('test-app-id')
  })

  it('shares one loading promise across concurrent calls', async () => {
    const { loadMetaEmbeddedSignupSdk } = await getLoader()

    const first = loadMetaEmbeddedSignupSdk('test-app-id')
    const second = loadMetaEmbeddedSignupSdk('test-app-id')

    expect(first).toBe(second)
    expect(document.querySelectorAll('#facebook-jssdk')).toHaveLength(1)

    window.FB = { init: vi.fn() }
    window.fbAsyncInit()

    await expect(first).resolves.toBe(window.FB)
  })

  it('removes a failed script and allows another loading attempt', async () => {
    const { loadMetaEmbeddedSignupSdk } = await getLoader()

    const first = loadMetaEmbeddedSignupSdk('test-app-id')
    const firstScript = document.getElementById('facebook-jssdk')

    firstScript.dispatchEvent(new Event('error'))

    await expect(first).rejects.toThrow(
      'Unable to load Meta signup.',
    )
    expect(document.getElementById('facebook-jssdk')).toBeNull()

    const second = loadMetaEmbeddedSignupSdk('test-app-id')

    expect(document.getElementById('facebook-jssdk')).not.toBeNull()

    window.FB = { init: vi.fn() }
    window.fbAsyncInit()

    await expect(second).resolves.toBe(window.FB)
  })

  it('allows retry after SDK initialization fails', async () => {
    const { loadMetaEmbeddedSignupSdk } = await getLoader()
    const init = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('Initialization failed')
      })
      .mockImplementationOnce(() => {})

    window.FB = { init }

    await expect(
      loadMetaEmbeddedSignupSdk('test-app-id'),
    ).rejects.toThrow('Unable to initialise the Meta signup service.')

    await expect(
      loadMetaEmbeddedSignupSdk('test-app-id'),
    ).resolves.toBe(window.FB)

    expect(init).toHaveBeenCalledTimes(2)
  })

  it('reinitializes the SDK when the App ID changes', async () => {
    const { loadMetaEmbeddedSignupSdk } = await getLoader()
    const init = vi.fn()

    window.FB = { init }

    await loadMetaEmbeddedSignupSdk('first-app-id')
    await loadMetaEmbeddedSignupSdk('second-app-id')

    expect(init).toHaveBeenNthCalledWith(1, {
      appId: 'first-app-id',
      autoLogAppEvents: true,
      xfbml: false,
      version: 'v27.0',
    })

    expect(init).toHaveBeenNthCalledWith(2, {
      appId: 'second-app-id',
      autoLogAppEvents: true,
      xfbml: false,
      version: 'v27.0',
    })

    expect(window.__beevoMetaAppId).toBe('second-app-id')
  })

  it('rejects and removes an already-loaded script when FB is unavailable', async () => {
    const { loadMetaEmbeddedSignupSdk } = await getLoader()
    const script = document.createElement('script')

    script.id = 'facebook-jssdk'
    script.dataset.beevoLoadState = 'loaded'
    document.head.appendChild(script)

    await expect(
      loadMetaEmbeddedSignupSdk('test-app-id'),
    ).rejects.toThrow('Unable to initialise the Meta signup service.')

    expect(document.getElementById('facebook-jssdk')).toBeNull()
  })
})
