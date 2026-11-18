import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEnquiries, createEnquiry } from '../services/enquiry.service.js'
import { getCustomers } from '../../customers/services/customer.service.js'

const statuses = ['new', 'contacted', 'qualified', 'converted', 'lost']

const statusStyles = {
  new: 'bg-peach-sand text-inkberry',
  contacted: 'bg-inkberry/10 text-inkberry',
  qualified: 'bg-peach-sand/70 text-inkberry',
  converted: 'bg-inkberry text-warm-ivory',
  lost: 'bg-inkberry/5 text-inkberry/55',
}

const initialForm = {
  customerId: '',
  subject: '',
  description: '',
  source: '',
  status: 'new',
  estimatedValue: '',
  currency: 'NGN',
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatValue(value, currency = 'NGN') {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState([])
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadData() {
    try {
      const [enquiryData, customerData] = await Promise.all([
        getEnquiries(),
        getCustomers(),
      ])
      setEnquiries(enquiryData)
      setCustomers(customerData)
    } catch (err) {
      setError(err.message || 'We could not load your enquiries. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [])

  const filteredEnquiries = useMemo(() => {
    const term = search.trim().toLowerCase()

    return enquiries.filter((enquiry) => {
      const matchesSearch =
        !term ||
        [enquiry.subject, enquiry.customer_name, enquiry.source]
          .some((value) => String(value || '').toLowerCase().includes(term))

      const matchesStatus =
        statusFilter === 'all' || enquiry.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [enquiries, search, statusFilter])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleCreate(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.customerId) {
      setError('Please select a customer for this enquiry.')
      return
    }

    if (form.subject.trim().length < 2) {
      setError('Please enter an enquiry subject.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        customerId: Number(form.customerId),
        subject: form.subject.trim(),
        description: form.description.trim(),
        source: form.source.trim(),
        status: form.status,
        currency: form.currency,
      }

      if (form.estimatedValue !== '') {
        payload.estimatedValue = Number(form.estimatedValue)
      }

      const created = await createEnquiry(payload)
      setEnquiries((current) => [created, ...current])
      setShowCreate(false)
      setForm(initialForm)
      setSuccess('Enquiry created successfully.')
    } catch (err) {
      setError(err.message || 'We could not create this enquiry. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const statusCounts = statuses.reduce((counts, status) => {
    counts[status] = enquiries.filter((item) => item.status === status).length
    return counts
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-inkberry/55">Sales management</p>
          <h1 className="mt-1 text-2xl font-bold text-inkberry">Enquiries</h1>
          <p className="mt-1 text-sm text-inkberry/60">
            Keep track of customer interest and sales opportunities.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError('')
            setSuccess('')
            setShowCreate(true)
          }}
          className="rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory transition hover:bg-inkberry/90"
        >
          Create enquiry
        </button>
      </div>

      {success && (
        <div className="rounded-xl border border-inkberry/15 bg-peach-sand/40 px-4 py-3 text-sm text-inkberry">
          {success}
        </div>
      )}

      {error && !showCreate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-inkberry/15 bg-peach-sand/40 px-4 py-3 text-sm text-inkberry">
          <span>{error}</span>
          <button type="button" onClick={loadData} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statuses.map((status) => (
          <button
            type="button"
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            className={`rounded-xl border p-4 text-left transition ${
              statusFilter === status
                ? 'border-inkberry bg-peach-sand/50'
                : 'border-inkberry/10 bg-white'
            }`}
          >
            <p className="text-xs capitalize text-inkberry/55">{status}</p>
            <p className="mt-1 text-2xl font-bold text-inkberry">
              {statusCounts[status] || 0}
            </p>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-inkberry/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-inkberry/10 p-4 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by subject, customer or source..."
            className="min-w-0 flex-1 rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/40 focus:border-inkberry"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-inkberry/15 bg-warm-ivory px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
          >
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadData}
            className="rounded-xl border border-inkberry/15 px-4 py-3 text-sm font-semibold text-inkberry hover:bg-warm-ivory"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-inkberry/55">
            Loading enquiries...
          </div>
        ) : filteredEnquiries.length === 0 ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold text-inkberry">No enquiries found</h2>
            <p className="mt-2 text-sm text-inkberry/55">
              {enquiries.length === 0
                ? 'Create your first enquiry to start tracking customer interest.'
                : 'Try changing your search or status filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-warm-ivory text-xs uppercase tracking-wide text-inkberry/55">
                <tr>
                  <th className="px-5 py-4 font-semibold">Enquiry</th>
                  <th className="px-5 py-4 font-semibold">Customer</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Estimated value</th>
                  <th className="px-5 py-4 font-semibold">Date created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inkberry/10">
                {filteredEnquiries.map((enquiry) => (
                  <tr key={enquiry.id} className="hover:bg-warm-ivory/60">
                    <td className="px-5 py-4">
                      <Link to={`/enquiries/${enquiry.id}`} className="font-semibold text-inkberry hover:underline">{enquiry.subject}</Link>
                      <p className="mt-1 text-xs text-inkberry/50">
                        {enquiry.source || 'Source not specified'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-inkberry/75">
                      {enquiry.customer_name || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${statusStyles[enquiry.status] || statusStyles.new}`}>
                        {enquiry.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-inkberry/75">
                      {formatValue(enquiry.estimated_value, enquiry.currency)}
                    </td>
                    <td className="px-5 py-4 text-sm text-inkberry/60">
                      {formatDate(enquiry.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-inkberry/10 px-5 py-3 text-xs text-inkberry/50">
          Showing {filteredEnquiries.length} of {enquiries.length} enquiries
        </div>
      </section>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowCreate(false)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-warm-ivory p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-inkberry">Create enquiry</h2>
                <p className="mt-1 text-sm text-inkberry/55">
                  Record a customer's interest or sales request.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-3 py-2 text-sm text-inkberry/60 hover:bg-peach-sand/50"
              >
                Close
              </button>
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-peach-sand/60 px-4 py-3 text-sm text-inkberry">
                {error}
              </p>
            )}

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Customer *
                </label>
                <select
                  name="customerId"
                  value={form.customerId}
                  onChange={updateField}
                  required
                  className="w-full rounded-xl border border-inkberry/15 bg-white px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="mt-1 text-xs text-inkberry/55">
                    Add a customer before creating an enquiry.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Subject *
                </label>
                <input
                  name="subject"
                  value={form.subject}
                  onChange={updateField}
                  required
                  minLength={2}
                  maxLength={200}
                  placeholder="e.g. Website development request"
                  className="w-full rounded-xl border border-inkberry/15 bg-white px-4 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Description
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  rows={3}
                  maxLength={3000}
                  placeholder="Add details about what the customer needs..."
                  className="w-full resize-y rounded-xl border border-inkberry/15 bg-white px-4 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                    Enquiry source
                  </label>
                  <input
                    name="source"
                    value={form.source}
                    onChange={updateField}
                    maxLength={50}
                    placeholder="e.g. WhatsApp, Website, Referral"
                    className="w-full rounded-xl border border-inkberry/15 bg-white px-4 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                    Initial status
                  </label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={updateField}
                    className="w-full rounded-xl border border-inkberry/15 bg-white px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                    Estimated value
                  </label>
                  <input
                    type="number"
                    name="estimatedValue"
                    value={form.estimatedValue}
                    onChange={updateField}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full rounded-xl border border-inkberry/15 bg-white px-4 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-inkberry">
                    Currency
                  </label>
                  <select
                    name="currency"
                    value={form.currency}
                    onChange={updateField}
                    className="w-full rounded-xl border border-inkberry/15 bg-white px-4 py-3 text-sm text-inkberry outline-none focus:border-inkberry"
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
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-inkberry/15 px-5 py-3 text-sm font-semibold text-inkberry hover:bg-peach-sand/30"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || customers.length === 0}
                  className="rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
