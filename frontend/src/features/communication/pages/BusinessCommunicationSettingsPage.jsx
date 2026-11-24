import { useEffect, useRef, useState } from 'react'
import {
  getBusinessCommunicationSettings,
  updateBusinessCommunicationSettings,
  getWhatsAppConnectionStatus,
  disconnectWhatsAppConnection,
  createMetaWhatsAppSignupState,
  completeMetaWhatsAppEmbeddedSignup,
} from '../services/communication.service.js'
import { loadMetaEmbeddedSignupSdk } from '../services/meta-embedded-signup.js'

const emptySettings = {
  email_sender_name: '',
  email_sender_address: '',
  email_reply_to: '',
  email_status: 'not_configured',
  sms_sender_id: '',
  sms_status: 'not_configured',
  whatsapp_business_account_id: '',
  whatsapp_phone_number_id: '',
  whatsapp_display_number: '',
  whatsapp_status: 'not_configured',
}

const META_APP_ID = import.meta.env.VITE_META_APP_ID?.trim() || ''
const META_EMBEDDED_SIGNUP_CONFIG_ID =
  import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || ''
const META_SIGNUP_CONFIGURED = Boolean(
  META_APP_ID && META_EMBEDDED_SIGNUP_CONFIG_ID
)

const statusLabels = {
  not_configured: 'Not configured',
  pending: 'Pending review',
  verified: 'Verified',
  approved: 'Approved',
  rejected: 'Rejected',
}

function extractSettings(result) {
  return result?.data?.settings || result?.data || result?.settings || result || {}
}

function Status({ value }) {
  const label = statusLabels[value] || 'Not configured'
  const appearance =
    value === 'verified' || value === 'approved'
      ? 'border-green-200 bg-green-50 text-green-700'
      : value === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-700'
        : value === 'pending'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-inkberry/10 bg-warm-ivory text-inkberry/60'

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${appearance}`}>
      {label}
    </span>
  )
}

function Field({ label, name, value, onChange, placeholder, type = 'text', help }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-inkberry">{label}</span>
      <input
        type={type}
        name={name}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-11 w-full rounded-xl border border-inkberry/15 bg-white px-3.5 py-2.5 text-base text-inkberry outline-none transition placeholder:text-inkberry/35 focus:border-inkberry/50 focus:ring-2 focus:ring-peach-sand/70"
      />
      {help && <span className="mt-1.5 block text-xs leading-5 text-inkberry/50">{help}</span>}
    </label>
  )
}

function ChannelSection({ title, description, status, children }) {
  return (
    <section className="space-y-4 rounded-2xl border border-inkberry/10 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-inkberry">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-inkberry/55">{description}</p>
        </div>
        <Status value={status} />
      </div>
      {children}
    </section>
  )
}

export default function BusinessCommunicationSettingsPage() {
  const [settings, setSettings] = useState(emptySettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [whatsappConnection, setWhatsappConnection] = useState(null)
  const [connectionLoading, setConnectionLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [metaReady, setMetaReady] = useState(false)
  const [metaConnecting, setMetaConnecting] = useState(false)
  const [metaError, setMetaError] = useState('')
  const [metaInfo, setMetaInfo] = useState('')
  const [metaSignupPending, setMetaSignupPending] = useState(false)
  const [registrationPin, setRegistrationPin] = useState('')
  const metaSdkRef = useRef(null)
  const signupStateRef = useRef(null)
  const pendingSignupRef = useRef(null)

  // Automatically dismiss save feedback after four seconds.
  useEffect(() => {
    if (!notice && !error) return

    const timeout = window.setTimeout(() => {
      setNotice('')
      setError('')
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [notice, error])

  useEffect(() => {
    let active = true

    async function loadSettings() {
      try {
        const result = await getBusinessCommunicationSettings()
        if (active) {
          setSettings({ ...emptySettings, ...extractSettings(result) })
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Unable to load communication settings.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadWhatsAppConnection() {
      try {
        const result = await getWhatsAppConnectionStatus()
        if (active) setWhatsappConnection(result)
      } catch {
        if (active) {
          setWhatsappConnection({ status: 'unavailable', connected: false })
        }
      } finally {
        if (active) setConnectionLoading(false)
      }
    }

    void loadWhatsAppConnection()

    return () => {
      active = false
    }
  }, [])

  // Prepare the SDK and a short-lived, one-time backend state before
  // the user clicks. This allows FB.login to run directly from the click.
  useEffect(() => {
    if (!META_SIGNUP_CONFIGURED) return

    let active = true

    async function prepareMetaSignup() {
      try {
        const [sdk, stateResult] = await Promise.all([
          loadMetaEmbeddedSignupSdk(META_APP_ID),
          createMetaWhatsAppSignupState(),
        ])

        if (!active) return

        metaSdkRef.current = sdk
        signupStateRef.current = stateResult?.data?.state || null

        if (!signupStateRef.current) {
          throw new Error('Unable to prepare a secure WhatsApp signup session.')
        }

        setMetaReady(true)
        setMetaError('')
      } catch (setupError) {
        if (active) {
          setMetaError(
            setupError.message || 'Unable to prepare Meta WhatsApp signup.'
          )
        }
      }
    }

    void prepareMetaSignup()

    return () => {
      active = false
    }
  }, [])

  function prepareMetaSignupCompletion() {
    const pending = pendingSignupRef.current

    if (
      pending?.state &&
      pending?.code &&
      pending?.businessAccountId &&
      pending?.phoneNumberId
    ) {
      setMetaSignupPending(true)
      setMetaInfo(
        'Meta has selected your WhatsApp account. Enter the six-digit registration PIN for this phone number to finish connecting it.'
      )
    }
  }

  async function handleMetaRegistrationSubmit(event) {
    event.preventDefault()

    const pending = pendingSignupRef.current
    const pin = registrationPin.trim()

    if (!/^\\d{6}$/.test(pin)) {
      setMetaError('Enter the six-digit WhatsApp registration PIN.')
      return
    }

    if (
      !pending ||
      pending.completing ||
      !pending.state ||
      !pending.code ||
      !pending.businessAccountId ||
      !pending.phoneNumberId
    ) {
      setMetaError('The Meta signup session is incomplete. Please start again.')
      return
    }

    pending.completing = true
    setMetaConnecting(true)
    setMetaError('')
    setMetaInfo('Registering your WhatsApp number and completing setup…')
    setError('')
    setNotice('')

    try {
      await completeMetaWhatsAppEmbeddedSignup({
        state: pending.state,
        code: pending.code,
        businessAccountId: pending.businessAccountId,
        phoneNumberId: pending.phoneNumberId,
        pin,
      })

      const refreshedConnection = await getWhatsAppConnectionStatus()
      setWhatsappConnection(refreshedConnection)
      setNotice('WhatsApp has been registered and connected successfully.')
      setMetaInfo('')
      setMetaSignupPending(false)
      setRegistrationPin('')
      pendingSignupRef.current = null
      signupStateRef.current = null

      // Prepare a fresh state for a future reconnection.
      try {
        const nextState = await createMetaWhatsAppSignupState()
        signupStateRef.current = nextState?.data?.state || null
        setMetaReady(Boolean(signupStateRef.current))
      } catch {
        setMetaReady(false)
      }
    } catch (signupError) {
      setMetaError(
        signupError.message || 'Unable to connect WhatsApp. Please try again.'
      )
      setMetaInfo('')
      setMetaSignupPending(false)
      setRegistrationPin('')
      pendingSignupRef.current = null
      signupStateRef.current = null
      setMetaReady(false)

      // The backend consumes the state before exchanging the Meta code.
      // A failed exchange therefore requires a new signup state.
      try {
        const nextState = await createMetaWhatsAppSignupState()
        signupStateRef.current = nextState?.data?.state || null
        setMetaReady(Boolean(signupStateRef.current))
      } catch {
        setMetaReady(false)
      }
    } finally {
      setMetaConnecting(false)
    }
  }

  // Meta sends the selected WhatsApp assets through a postMessage event.
  useEffect(() => {
    function handleMetaMessage(event) {
      let hostname

      try {
        hostname = new URL(event.origin).hostname
      } catch {
        return
      }

      if (
        hostname !== 'facebook.com' &&
        !hostname.endsWith('.facebook.com')
      ) {
        return
      }

      let message = event.data

      if (typeof message === 'string') {
        try {
          message = JSON.parse(message)
        } catch {
          return
        }
      }

      if (message?.type !== 'WA_EMBEDDED_SIGNUP') return

      if (message.event === 'CANCEL') {
        setMetaSignupPending(false)
        setRegistrationPin('')
        pendingSignupRef.current = null
        setMetaInfo('WhatsApp setup was cancelled. You can try again whenever you are ready.')
        return
      }

      if (message.event === 'ERROR') {
        setMetaError(
          message.data?.error_message ||
            'Meta reported a problem during WhatsApp setup.'
        )
        setMetaInfo('')
        setMetaSignupPending(false)
        setRegistrationPin('')
        pendingSignupRef.current = null
        return
      }

      if (message.event !== 'FINISH') return

      const data = message.data || {}
      const pending = pendingSignupRef.current

      if (!pending) return

      pending.businessAccountId = data.waba_id || ''
      pending.phoneNumberId = data.phone_number_id || ''

      prepareMetaSignupCompletion()
    }

    window.addEventListener('message', handleMetaMessage)

    return () => {
      window.removeEventListener('message', handleMetaMessage)
    }
  }, [])

  function handleMetaWhatsAppConnect() {
    const sdk = metaSdkRef.current
    const state = signupStateRef.current

    if (!sdk || !state || metaConnecting) {
      setMetaError('WhatsApp setup is not ready yet. Please wait and try again.')
      return
    }

    setMetaError('')
    setMetaInfo('')
    setError('')
    setNotice('')

    pendingSignupRef.current = {
      state,
      code: '',
      businessAccountId: '',
      phoneNumberId: '',
      completing: false,
    }

    try {
      // Keep this call directly inside the click handler for popup permissions.
      sdk.login(
        (response) => {
          const pending = pendingSignupRef.current

          if (!pending) return

          if (response?.authResponse?.code) {
            pending.code = response.authResponse.code
            prepareMetaSignupCompletion()
            return
          }

          pendingSignupRef.current = null
          setMetaSignupPending(false)
          setRegistrationPin('')
          setMetaInfo('Meta signup was not completed. You can try again.')
        },
        {
          config_id: META_EMBEDDED_SIGNUP_CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
          },
        },
      )
    } catch {
      pendingSignupRef.current = null
      setMetaSignupPending(false)
      setRegistrationPin('')
      setMetaError('Unable to open Meta signup. Please try again.')
    }
  }

  async function handleWhatsAppDisconnect() {
    const confirmed = window.confirm(
      'Disconnect this business WhatsApp account? Beevo will stop using it to send and receive WhatsApp messages.'
    )

    if (!confirmed) return

    setDisconnecting(true)
    setError('')
    setNotice('')

    try {
      await disconnectWhatsAppConnection()
      setWhatsappConnection({
        status: 'not_connected',
        connected: false,
        connection: null,
      })
      setNotice('The business WhatsApp account has been disconnected.')
    } catch (disconnectError) {
      setError(
        disconnectError.message || 'Unable to disconnect WhatsApp. Please try again.'
      )
    } finally {
      setDisconnecting(false)
    }
  }

  function handleChange(event) {
    const { name, value } = event.target
    setSettings((current) => ({ ...current, [name]: value }))
    setNotice('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    const payload = {
      email_sender_name: settings.email_sender_name.trim(),
      email_sender_address: settings.email_sender_address.trim(),
      email_reply_to: settings.email_reply_to.trim(),
      sms_sender_id: settings.sms_sender_id.trim(),
      whatsapp_business_account_id: settings.whatsapp_business_account_id.trim(),
      whatsapp_phone_number_id: settings.whatsapp_phone_number_id.trim(),
      whatsapp_display_number: settings.whatsapp_display_number.trim(),
    }

    try {
      const result = await updateBusinessCommunicationSettings(payload)
      const updated = extractSettings(result)
      setSettings((current) => ({ ...current, ...updated }))
      setNotice('Your communication settings have been saved.')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save your communication settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center text-sm text-inkberry/55">
        Loading communication settings…
      </div>
    )
  }

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-inkberry/45">
          Beevo workspace
        </p>
        <h1 className="mt-1 text-2xl font-bold text-inkberry sm:text-3xl">
          Business communication settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-inkberry/60">
          Set the sender identities your business wants to use when communicating with customers.
          Approval and provider connection are handled separately.
        </p>
      </header>

      {(error || notice) && (
        <div
          key={error || notice}
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          className={`fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-xl border px-5 py-4 text-sm font-medium shadow-xl sm:max-w-md ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          <span className="mt-0.5 text-base" aria-hidden="true">
            {error ? "!" : "✓"}
          </span>
          <span className="flex-1 leading-5">{error || notice}</span>
          <button
            type="button"
            onClick={() => {
              setError('')
              setNotice('')
            }}
            className="ml-2 rounded-md px-1 text-lg leading-none opacity-60 transition hover:opacity-100"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <ChannelSection
          title="Email"
          description="The business name and email address customers will see on your email communications."
          status={settings.email_status}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender name" name="email_sender_name" value={settings.email_sender_name} onChange={handleChange} placeholder="Your business name" />
            <Field label="Sender email address" name="email_sender_address" type="email" value={settings.email_sender_address} onChange={handleChange} placeholder="hello@yourbusiness.com" />
            <div className="sm:col-span-2">
              <Field label="Reply-to email (optional)" name="email_reply_to" type="email" value={settings.email_reply_to} onChange={handleChange} placeholder="support@yourbusiness.com" help="Customer replies can be directed to this address." />
            </div>
          </div>
        </ChannelSection>

        <ChannelSection
          title="SMS"
          description="Enter the Sender ID your business intends to use for text messages."
          status={settings.sms_status}
        >
          <Field
            label="SMS Sender ID"
            name="sms_sender_id"
            value={settings.sms_sender_id}
            onChange={handleChange}
            placeholder="Your approved Sender ID"
            help="Use 3–11 letters or numbers. Saving an ID here does not mean the mobile networks have approved it."
          />
        </ChannelSection>

        <section className="space-y-4 rounded-2xl border border-inkberry/10 bg-white p-4 sm:p-6">
          <div>
            <h2 className="font-semibold text-inkberry">WhatsApp account connection</h2>
            <p className="mt-1 text-sm leading-5 text-inkberry/55">
              This status reflects the actual Meta WhatsApp connection, not the account IDs saved below.
            </p>
          </div>

          {META_SIGNUP_CONFIGURED ? (
            <div className="space-y-2 rounded-xl border border-inkberry/10 bg-warm-ivory p-4">
              <div>
                <h3 className="text-sm font-semibold text-inkberry">
                  Connect with Meta
                </h3>
                <p className="mt-1 text-sm leading-5 text-inkberry/60">
                  Securely connect your business WhatsApp account through Meta.
                  Your business owner will approve the requested access in Meta.
                </p>
              </div>

              <button
                type="button"
                onClick={handleMetaWhatsAppConnect}
                disabled={
                  !metaReady ||
                  metaConnecting ||
                  metaSignupPending ||
                  Boolean(whatsappConnection?.connected)
                }
                className="min-h-11 rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-white transition hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {metaConnecting
                  ? 'Connecting WhatsApp…'
                  : metaReady
                    ? 'Connect WhatsApp with Meta'
                    : 'Preparing secure connection…'}
              </button>

              {metaSignupPending && (
                <form
                  onSubmit={handleMetaRegistrationSubmit}
                  className="space-y-3 rounded-xl border border-inkberry/10 bg-white p-4"
                >
                  <div>
                    <label
                      htmlFor="meta-whatsapp-registration-pin"
                      className="block text-sm font-medium text-inkberry"
                    >
                      WhatsApp two-step verification PIN
                    </label>
                    <p className="mt-1 text-xs leading-5 text-inkberry/60">
                      Enter the six-digit PIN associated with this WhatsApp phone number.
                    </p>
                  </div>

                  <input
                    id="meta-whatsapp-registration-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={registrationPin}
                    onChange={(event) =>
                      setRegistrationPin(event.target.value.replace(/\\D/g, '').slice(0, 6))
                    }
                    disabled={metaConnecting}
                    aria-label="WhatsApp registration PIN"
                    className="min-h-11 w-full rounded-xl border border-inkberry/20 bg-white px-4 py-3 text-base tracking-[0.3em] text-inkberry outline-none focus:border-inkberry disabled:opacity-60"
                  />

                  <button
                    type="submit"
                    disabled={registrationPin.length !== 6 || metaConnecting}
                    className="min-h-11 rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-white transition hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {metaConnecting
                      ? 'Registering WhatsApp…'
                      : 'Finish WhatsApp registration'}
                  </button>
                </form>
              )}

              {metaError && (
                <p role="alert" className="text-sm text-red-700">
                  {metaError}
                </p>
              )}

              {metaInfo && (
                <p role="status" className="text-sm text-inkberry/65">
                  {metaInfo}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-800">
              Meta Embedded Signup is not configured yet. Add the Meta App ID
              and Embedded Signup Configuration ID to the frontend environment
              to enable this connection method.
            </p>
          )}

          {connectionLoading ? (
            <p className="text-sm text-inkberry/55">Checking WhatsApp connection…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Status
                  value={
                    whatsappConnection?.status === 'connected'
                      ? 'verified'
                      : whatsappConnection?.status === 'pending'
                        ? 'pending'
                        : whatsappConnection?.status === 'needs_attention' ||
                            whatsappConnection?.status === 'ambiguous' ||
                            whatsappConnection?.status === 'unavailable'
                          ? 'rejected'
                          : 'not_configured'
                  }
                />
                <span className="text-sm font-medium text-inkberry">
                  {whatsappConnection?.status === 'connected'
                    ? 'WhatsApp is connected'
                    : whatsappConnection?.status === 'pending'
                      ? 'Connection is pending'
                      : whatsappConnection?.status === 'needs_attention'
                        ? 'Connection needs attention'
                        : whatsappConnection?.status === 'ambiguous'
                          ? 'Multiple active connections detected'
                          : whatsappConnection?.status === 'unavailable'
                            ? 'Connection status is currently unavailable'
                            : 'No WhatsApp account connected'}
                </span>
              </div>

              {whatsappConnection?.connection && (
                <div className="rounded-xl bg-warm-ivory p-3 text-sm text-inkberry">
                  {whatsappConnection.connection.displayName && (
                    <p className="font-semibold">
                      {whatsappConnection.connection.displayName}
                    </p>
                  )}
                  {whatsappConnection.connection.displayNumber && (
                    <p className="mt-1 text-inkberry/65">
                      {whatsappConnection.connection.displayNumber}
                    </p>
                  )}
                </div>
              )}

              {whatsappConnection?.message && (
                <p className="text-sm text-amber-700">
                  {whatsappConnection.message}
                </p>
              )}

              {whatsappConnection?.connected && (
                <button
                  type="button"
                  onClick={handleWhatsAppDisconnect}
                  disabled={disconnecting}
                  className="min-h-11 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect WhatsApp'}
                </button>
              )}
            </>
          )}
        </section>

        <ChannelSection
          title="WhatsApp Business"
          description="Add the identifiers for your business's WhatsApp Business Platform account."
          status={settings.whatsapp_status}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp Business Account ID" name="whatsapp_business_account_id" value={settings.whatsapp_business_account_id} onChange={handleChange} placeholder="Business account ID" />
            <Field label="Phone Number ID" name="whatsapp_phone_number_id" value={settings.whatsapp_phone_number_id} onChange={handleChange} placeholder="WhatsApp phone number ID" />
            <div className="sm:col-span-2">
              <Field label="WhatsApp display number" name="whatsapp_display_number" value={settings.whatsapp_display_number} onChange={handleChange} placeholder="+234…" help="The business phone number displayed to customers." />
            </div>
          </div>
        </ChannelSection>

        <div className="rounded-xl border border-inkberry/10 bg-warm-ivory px-4 py-3 text-xs leading-5 text-inkberry/60">
          These fields store sender identities and account identifiers only. Do not enter API keys,
          access tokens, passwords or other provider secrets here. Channel statuses are controlled
          by Beevo's verification process, not by this form.
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-xl bg-inkberry px-6 py-3 text-sm font-semibold text-white transition hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save communication settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
