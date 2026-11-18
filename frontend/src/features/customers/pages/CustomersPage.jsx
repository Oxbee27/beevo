import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createCustomer,
  getCustomers,
} from '../services/customer.service.js'

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function AddCustomerDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (form.name.trim().length < 2) {
      setError('Please enter the customer’s full name.')
      return
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    setSaving(true)

    try {
      await createCustomer({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      })

      await onCreated()
      onClose()
    } catch (err) {
      setError(err.message || 'We could not save this customer. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'mt-2 w-full rounded-lg border border-inkberry/15 bg-white px-3.5 py-3 text-sm text-inkberry outline-none transition-colors placeholder:text-inkberry/35 focus:border-inkberry/60'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-inkberry/10 bg-warm-ivory p-6 shadow-xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">
              Customer directory
            </p>
            <h2 id="add-customer-title" className="mt-1 text-xl font-semibold text-inkberry">
              Add a customer
            </h2>
            <p className="mt-2 text-sm text-inkberry/60">
              Save their details so you can keep every enquiry organised.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
            className="rounded-lg px-2 py-1 text-xl text-inkberry/50 hover:bg-peach-sand/60 hover:text-inkberry"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="customer-name" className="text-sm font-medium text-inkberry">
              Customer name <span className="text-inkberry/50">*</span>
            </label>
            <input
              id="customer-name"
              name="name"
              value={form.name}
              onChange={updateField}
              placeholder="Enter full name"
              autoFocus
              maxLength={150}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="customer-email" className="text-sm font-medium text-inkberry">
              Email address
            </label>
            <input
              id="customer-email"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              placeholder="customer@example.com"
              maxLength={255}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="customer-phone" className="text-sm font-medium text-inkberry">
              Phone number
            </label>
            <input
              id="customer-phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={updateField}
              placeholder="Enter phone number"
              maxLength={30}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="customer-notes" className="text-sm font-medium text-inkberry">
              Notes
            </label>
            <textarea
              id="customer-notes"
              name="notes"
              value={form.notes}
              onChange={updateField}
              placeholder="Additional information about this customer"
              rows={3}
              maxLength={2000}
              className={`${inputClass} resize-y`}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-peach-sand/60 px-3 py-3 text-sm text-inkberry">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-inkberry/15 px-5 py-3 text-sm font-medium text-inkberry hover:bg-peach-sand/40 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving customer...' : 'Save customer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)

  const loadCustomers = useCallback(async () => {
    try {
      const data = await getCustomers()
      setCustomers(data)
    } catch (err) {
      setError(err.message || 'We could not load your customers. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadCustomers)
  }, [loadCustomers])

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return customers

    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone]
        .some((value) => value?.toLowerCase().includes(term)),
    )
  }, [customers, search])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 pb-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">
            Business workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-inkberry sm:text-3xl">
            Customers
          </h1>
          <p className="mt-2 text-sm text-inkberry/60">
            Keep customer details organised and every relationship moving.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory transition-colors hover:bg-inkberry/90"
        >
          <span className="text-lg leading-none">+</span>
          Add customer
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-inkberry/10 bg-white p-5">
          <p className="text-sm text-inkberry/55">Total customers</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-inkberry">
            {loading ? '—' : customers.length.toLocaleString('en-NG')}
          </p>
          <p className="mt-1 text-xs text-inkberry/45">Customers in this workspace</p>
        </section>

        <section className="rounded-xl border border-inkberry/10 bg-white p-5">
          <p className="text-sm text-inkberry/55">Search directory</p>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email or phone..."
            aria-label="Search customers"
            className="mt-2 w-full rounded-lg border border-inkberry/15 bg-warm-ivory px-3.5 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60"
          />
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-inkberry/10 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-inkberry/10 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-inkberry">Customer directory</h2>
            <p className="mt-1 text-xs text-inkberry/50">
              {loading ? 'Loading customers...' : `${filteredCustomers.length} customer${filteredCustomers.length === 1 ? '' : 's'} shown`}
            </p>
          </div>

          <button
            type="button"
            onClick={loadCustomers}
            disabled={loading}
            className="rounded-lg px-3 py-2 text-sm font-medium text-inkberry hover:bg-peach-sand/40 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="m-5 rounded-lg bg-peach-sand/60 p-4 sm:m-6">
            <p role="alert" className="text-sm text-inkberry">{error}</p>
            <button
              type="button"
              onClick={loadCustomers}
              className="mt-3 text-sm font-semibold text-inkberry underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-inkberry/55">Loading your customers...</p>
          </div>
        ) : !error && filteredCustomers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-peach-sand/60 text-xl text-inkberry">
              ♧
            </div>
            <h3 className="mt-4 font-semibold text-inkberry">
              {search ? 'No matching customers' : 'Your customer list starts here'}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-inkberry/55">
              {search
                ? 'Try another name, email address or phone number.'
                : 'Add your first customer to keep their details and enquiries organised in one place.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => setShowAddDialog(true)}
                className="mt-5 rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90"
              >
                Add your first customer
              </button>
            )}
          </div>
        ) : !error && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead className="bg-warm-ivory">
                <tr className="text-xs font-semibold uppercase tracking-wider text-inkberry/50">
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Date added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inkberry/10">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-warm-ivory/70">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-peach-sand text-xs font-semibold text-inkberry">
                          {getInitials(customer.name)}
                        </div>
                        <Link
                          to={`/customers/${customer.id}`}
                          className="text-sm font-medium text-inkberry hover:underline hover:underline-offset-4"
                        >
                          {customer.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-inkberry/65">
                      {customer.phone || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-inkberry/65">
                      {customer.email || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-inkberry/55">
                      {formatDate(customer.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAddDialog && (
        <AddCustomerDialog
          onClose={() => setShowAddDialog(false)}
          onCreated={loadCustomers}
        />
      )}
    </div>
  )
}
