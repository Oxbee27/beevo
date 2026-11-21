import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import {
  deleteCustomer,
  getCustomer,
  getCustomerCommunicationPreferences,
  updateCustomer,
  updateCustomerCommunicationPreference,
} from '../services/customer.service.js'

const inputClass =
  'mt-2 w-full rounded-lg border border-inkberry/15 bg-white px-3.5 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60'

const channels = [
  { id: 'email', title: 'Email', description: 'Product updates, offers and follow-up emails' },
  { id: 'sms', title: 'SMS', description: 'Text messages and important updates' },
  { id: 'whatsapp', title: 'WhatsApp', description: 'Direct WhatsApp messages and follow-ups' },
]

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function PreferenceCard({ channel, preference, onSave }) {
  const [status, setStatus] = useState(preference.consent_status || 'unknown')
  const [source, setSource] = useState(preference.consent_source || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSave() {
    setError('')
    setSuccess('')

    if (status === 'granted' && source.trim().length < 2) {
      setError('Please enter where the customer gave consent.')
      return
    }

    setSaving(true)

    try {
      const updated = await onSave({
        channel: channel.id,
        consentStatus: status,
        ...(status === 'granted' ? { consentSource: source.trim() } : {}),
      })
      setStatus(updated.consent_status || status)
      setSource(updated.consent_source || source)
      setSuccess('Preference saved.')
    } catch (err) {
      setError(err.message || 'We could not save this preference.')
    } finally {
      setSaving(false)
    }
  }

  const unchanged =
    status === (preference.consent_status || 'unknown') &&
    source.trim() === (preference.consent_source || '')

  return (
    <section className="rounded-xl border border-inkberry/10 bg-white p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="font-semibold text-inkberry">{channel.title}</h3>
          <p className="mt-1 text-sm text-inkberry/55">{channel.description}</p>
        </div>
        <span className="w-fit rounded-full bg-warm-ivory px-3 py-1 text-xs font-medium capitalize text-inkberry/70">
          {status}
        </span>
      </div>

      <div className="mt-5">
        <label className="text-sm font-medium text-inkberry" htmlFor={`consent-${channel.id}`}>
          Customer permission
        </label>
        <select
          id={`consent-${channel.id}`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setSuccess('')
          }}
          className={inputClass}
        >
          <option value="unknown">Not recorded</option>
          <option value="granted">Consent granted</option>
          <option value="denied">Consent denied</option>
        </select>
      </div>

      {status === 'granted' && (
        <div className="mt-4">
          <label className="text-sm font-medium text-inkberry" htmlFor={`source-${channel.id}`}>
            Where was consent given?
          </label>
          <input
            id={`source-${channel.id}`}
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              setSuccess('')
            }}
            placeholder="e.g. Website opt-in form"
            maxLength={100}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-inkberry/45">
            Required when permission is granted.
          </p>
        </div>
      )}

      {preference.consent_at && (
        <p className="mt-3 text-xs text-inkberry/45">
          Last recorded: {formatDate(preference.consent_at)}
        </p>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-inkberry">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm text-inkberry">{success}</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || unchanged}
          className="w-full rounded-lg bg-inkberry px-4 py-3 text-sm font-medium text-warm-ivory hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {saving ? 'Saving...' : 'Save preference'}
        </button>
      </div>
    </section>
  )
}

export default function CustomerProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [preferences, setPreferences] = useState([])
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      const [customerData, preferenceData] = await Promise.all([
        getCustomer(id),
        getCustomerCommunicationPreferences(id),
      ])

      setCustomer(customerData)
      setForm({
        name: customerData.name || '',
        email: customerData.email || '',
        phone: customerData.phone || '',
        notes: customerData.notes || '',
      })

      const mapped = channels.map((channel) => {
        const existing = preferenceData.find((item) => item.channel === channel.id)
        return existing || {
          channel: channel.id,
          consent_status: 'unknown',
          consent_source: '',
          consent_at: null,
        }
      })

      setPreferences(mapped)
    } catch (err) {
      setError(err.message || 'We could not load this customer.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void Promise.resolve().then(loadProfile)
  }, [loadProfile])

  async function handleUpdate(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (form.name.trim().length < 2) {
      setError('Please enter a customer name with at least two characters.')
      return
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    setSaving(true)

    try {
      const updated = await updateCustomer(id, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      })
      setCustomer(updated)
      setForm({
        name: updated.name || '',
        email: updated.email || '',
        phone: updated.phone || '',
        notes: updated.notes || '',
      })
      setEditing(false)
      setMessage('Customer details updated successfully.')
    } catch (err) {
      setError(err.message || 'We could not update this customer.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePreferenceSave(payload) {
    const updated = await updateCustomerCommunicationPreference(id, payload)
    setPreferences((current) =>
      current.map((item) => item.channel === payload.channel ? updated : item),
    )
    return updated
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')

    try {
      await deleteCustomer(id)
      navigate('/customers', {
        replace: true,
        state: { message: 'Customer deleted successfully.' },
      })
      return true
    } catch (err) {
      setError(err.message || 'We could not delete this customer.')
      setDeleting(false)
      return false
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-inkberry/55">
        Loading customer profile...
      </div>
    )
  }

  if (error && !customer) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-inkberry/10 bg-white p-7">
        <p role="alert" className="text-sm text-inkberry">{error}</p>
        <button onClick={() => navigate('/customers')} className="mt-5 text-sm font-semibold text-inkberry underline underline-offset-4">
          Back to customers
        </button>
      </div>
    )
  }

  if (!customer) return null

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 pb-10 sm:space-y-7">
      <Link to="/customers" className="inline-flex text-sm font-medium text-inkberry/60 hover:text-inkberry">
        ← Back to customers
      </Link>

      <header className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">
            Customer profile
          </p>
          <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-inkberry sm:text-3xl">
            {customer.name}
          </h1>
          <p className="mt-2 text-sm text-inkberry/55">
            Customer since {formatDate(customer.created_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteDialog(true)}
          disabled={deleting}
          className="w-full rounded-lg border border-inkberry/15 px-4 py-3 text-sm font-medium text-inkberry hover:bg-peach-sand/40 disabled:opacity-50 sm:w-fit"
        >
          {deleting ? 'Deleting...' : 'Delete customer'}
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg bg-peach-sand/60 p-3 text-sm text-inkberry">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-peach-sand/60 p-3 text-sm text-inkberry">{message}</p>}

      <section className="min-w-0 rounded-xl border border-inkberry/10 bg-white p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <h2 className="font-semibold text-inkberry">Customer details</h2>
            <p className="mt-1 text-sm text-inkberry/50">Contact information and internal notes.</p>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setError('')
                setMessage('')
                setEditing(true)
              }}
              className="w-full rounded-lg border border-inkberry/15 px-4 py-3 text-sm font-medium text-inkberry hover:bg-warm-ivory sm:w-auto"
            >
              Edit details
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleUpdate} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-name" className="text-sm font-medium text-inkberry">Full name</label>
                <input id="profile-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={150} required className={inputClass} />
              </div>
              <div>
                <label htmlFor="profile-email" className="text-sm font-medium text-inkberry">Email address</label>
                <input id="profile-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={255} className={inputClass} />
              </div>
              <div>
                <label htmlFor="profile-phone" className="text-sm font-medium text-inkberry">Phone number</label>
                <input id="profile-phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="profile-notes" className="text-sm font-medium text-inkberry">Notes</label>
              <textarea id="profile-notes" rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={2000} className={`${inputClass} resize-y`} />
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => {
                setForm({
                  name: customer.name || '',
                  email: customer.email || '',
                  phone: customer.phone || '',
                  notes: customer.notes || '',
                })
                setEditing(false)
              }} className="w-full rounded-lg border border-inkberry/15 px-4 py-3 text-sm font-medium text-inkberry sm:w-auto">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory disabled:opacity-50 sm:w-auto">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-inkberry/45">Email address</dt>
              <dd className="mt-1 break-all text-sm text-inkberry">{customer.email || 'Not provided'}</dd>
            </div>
            <div>
              <dt className="text-xs text-inkberry/45">Phone number</dt>
              <dd className="mt-1 break-words text-sm text-inkberry">{customer.phone || 'Not provided'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-inkberry/45">Notes</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-inkberry">{customer.notes || 'No notes added.'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-inkberry">Communication preferences</h2>
          <p className="mt-1 text-sm text-inkberry/55">
            Record the customer's permission before sending messages through each channel.
          </p>
        </div>

        {preferences.map((preference) => {
          const channel = channels.find((item) => item.id === preference.channel)
          return channel ? (
            <PreferenceCard
              key={channel.id}
              channel={channel}
              preference={preference}
              onSave={handlePreferenceSave}
            />
          ) : null
        })}
      </section>

      {showDeleteDialog && (
        <ConfirmDialog
          title="Delete customer?"
          message={`Delete ${customer.name}? This action cannot be undone.`}
          confirmLabel="Delete customer"
          loading={deleting}
          onCancel={() => setShowDeleteDialog(false)}
          onConfirm={async () => {
            if (await handleDelete()) setShowDeleteDialog(false)
          }}
        />
      )}
    </div>
  )
}
