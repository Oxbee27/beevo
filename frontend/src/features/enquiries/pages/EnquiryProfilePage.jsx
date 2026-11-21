import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getEnquiry,
  updateEnquiry,
  deleteEnquiry,
} from '../services/enquiry.service.js'
import { getCustomers } from '../../customers/services/customer.service.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'

const statuses = ['new', 'contacted', 'qualified', 'converted', 'lost']

const initialForm = {
  customerId: '',
  subject: '',
  description: '',
  source: '',
  estimatedValue: '',
  currency: 'NGN',
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatValue(value, currency) {
  if (value === null || value === undefined || value === '') return 'Not specified'
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export default function EnquiryProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [enquiry, setEnquiry] = useState(null)
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [enquiryData, customerData] = await Promise.all([
        getEnquiry(id),
        getCustomers(),
      ])

      setEnquiry(enquiryData)
      setCustomers(customerData)
      setForm({
        customerId: String(enquiryData.customer_id || ''),
        subject: enquiryData.subject || '',
        description: enquiryData.description || '',
        source: enquiryData.source || '',
        estimatedValue: enquiryData.estimated_value ?? '',
        currency: enquiryData.currency || 'NGN',
      })
    } catch (err) {
      setError(err.message || 'We could not load this enquiry.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [loadData])

  async function handleStatusChange(event) {
    const status = event.target.value
    setSaving(true)
    setError('')
    setMessage('')

    try {
      await updateEnquiry(id, { status })
      await loadData()
      setMessage('Enquiry status updated successfully.')
    } catch (err) {
      setError(err.message || 'We could not update the enquiry status.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const payload = {
        customerId: Number(form.customerId),
        subject: form.subject.trim(),
        description: form.description.trim(),
        source: form.source.trim(),
        currency: form.currency,
      }

      if (form.estimatedValue !== '') {
        payload.estimatedValue = Number(form.estimatedValue)
      } else {
        payload.estimatedValue = null
      }

      await updateEnquiry(id, payload)
      setEditing(false)
      await loadData()
      setMessage('Enquiry details updated successfully.')
    } catch (err) {
      setError(err.message || 'We could not save the enquiry details.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await deleteEnquiry(id)
      navigate('/enquiries', {
        state: { message: 'Enquiry deleted successfully.' },
      })
      return true
    } catch (err) {
      setError(err.message || 'We could not delete this enquiry.')
      setSaving(false)
      return false
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-inkberry/60">Loading enquiry...</div>
  }

  if (!enquiry) {
    return (
      <div className="space-y-4">
        <Link to="/enquiries" className="text-sm font-semibold text-inkberry underline">
          Back to enquiries
        </Link>
        <p className="rounded-xl bg-peach-sand/40 p-4 text-sm text-inkberry">
          {error || 'This enquiry could not be found.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 pb-10 sm:space-y-6">
      <div>
        <Link to="/enquiries" className="text-sm font-medium text-inkberry/60 hover:text-inkberry">
          ← Back to enquiries
        </Link>

        <div className="mt-4 flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm text-inkberry/55">Enquiry #{enquiry.id}</p>
            <h1 className="mt-1 break-words text-2xl font-bold text-inkberry">
              {enquiry.subject}
            </h1>
            <p className="mt-1 text-sm text-inkberry/55">
              Customer: {enquiry.customer_name || 'Unknown customer'}
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditing(!editing)
              setError('')
              setMessage('')
            }}
            className="w-full rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory transition hover:bg-inkberry/90 disabled:opacity-50 sm:w-auto"
          >
            {editing ? 'Cancel editing' : 'Edit enquiry'}
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-inkberry/15 bg-peach-sand/40 px-4 py-3 text-sm text-inkberry">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-inkberry/15 bg-peach-sand/40 px-4 py-3 text-sm text-inkberry">
          {error}
        </div>
      )}

      <section className="min-w-0 rounded-2xl border border-inkberry/10 bg-white p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-inkberry">Enquiry status</h2>
            <p className="mt-1 text-sm text-inkberry/55">
              Update the current stage of this sales opportunity.
            </p>
          </div>

          <select
            value={enquiry.status}
            onChange={handleStatusChange}
            disabled={saving}
            className="w-full rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry disabled:opacity-50 sm:w-auto"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {editing ? (
        <section className="min-w-0 rounded-2xl border border-inkberry/10 bg-white p-4 sm:p-6">
          <h2 className="font-semibold text-inkberry">Edit enquiry details</h2>

          <form onSubmit={handleSave} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                Customer
              </label>
              <select
                value={form.customerId}
                onChange={(event) => setForm({ ...form, customerId: event.target.value })}
                required
                className="w-full rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                Subject
              </label>
              <input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                required
                minLength={2}
                maxLength={200}
                className="w-full rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={4}
                maxLength={3000}
                className="w-full rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Source
                </label>
                <input
                  value={form.source}
                  onChange={(event) => setForm({ ...form, source: event.target.value })}
                  maxLength={100}
                  placeholder="e.g. WhatsApp"
                  className="w-full rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Estimated value
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimatedValue}
                  onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })}
                  className="w-full rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Currency
                </label>
                <select
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                  className="w-full rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
                >
                  <option value="NGN">NGN — Nigerian Naira</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-inkberry/10 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                className="w-full rounded-xl border border-inkberry/15 px-5 py-3 text-sm font-semibold text-inkberry sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory disabled:opacity-50 sm:w-auto"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="min-w-0 rounded-2xl border border-inkberry/10 bg-white p-4 sm:p-6">
          <h2 className="font-semibold text-inkberry">Enquiry information</h2>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-inkberry/50">Customer</p>
              <p className="mt-1 break-words font-medium text-inkberry">
                {enquiry.customer_name || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-inkberry/50">Estimated value</p>
              <p className="mt-1 break-words font-medium text-inkberry">
                {formatValue(enquiry.estimated_value, enquiry.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-inkberry/50">Source</p>
              <p className="mt-1 break-words font-medium text-inkberry">
                {enquiry.source || 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-xs text-inkberry/50">Date created</p>
              <p className="mt-1 break-words font-medium text-inkberry">
                {formatDate(enquiry.created_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-inkberry/50">Last updated</p>
              <p className="mt-1 break-words font-medium text-inkberry">
                {formatDate(enquiry.updated_at)}
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-inkberry/10 pt-5">
            <p className="text-xs text-inkberry/50">Description</p>
            <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-inkberry/80">
              {enquiry.description || 'No description has been added.'}
            </p>
          </div>
        </section>
      )}

      <div className="flex flex-col sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setShowDeleteDialog(true)}
          disabled={saving}
          className="w-full rounded-xl border border-inkberry/20 px-5 py-3 text-sm font-semibold text-inkberry/70 transition hover:bg-peach-sand/40 disabled:opacity-50 sm:w-auto"
        >
          Delete enquiry
        </button>
      </div>

      {showDeleteDialog && (
        <ConfirmDialog
          title="Delete enquiry?"
          message="Are you sure you want to delete this enquiry? This action cannot be undone."
          confirmLabel="Delete enquiry"
          loading={saving}
          onCancel={() => setShowDeleteDialog(false)}
          onConfirm={async () => {
            if (await handleDelete()) setShowDeleteDialog(false)
          }}
        />
      )}
    </div>
  )
}
