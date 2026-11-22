import { useEffect, useState } from 'react'
import {
  getBusinessCommunicationSettings,
  updateBusinessCommunicationSettings,
} from '../services/communication.service.js'

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

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
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
