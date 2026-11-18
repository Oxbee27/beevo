import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFollowUps, createFollowUp, updateFollowUp, deleteFollowUp } from '../services/follow-up.service.js'
import { getEnquiries } from '../../enquiries/services/enquiry.service.js'

const statusStyles = {
  pending: 'bg-peach-sand/60 text-inkberry',
  completed: 'bg-inkberry/10 text-inkberry',
  cancelled: 'bg-inkberry/5 text-inkberry/50',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function toLocalDateTime(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState([])
  const [enquiries, setEnquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    enquiryId: '',
    note: '',
    dueAt: '',
  })

  async function loadData() {
    try {
      const [followUpRows, enquiryRows] = await Promise.all([
        getFollowUps(),
        getEnquiries(),
      ])
      setFollowUps(followUpRows)
      setEnquiries(enquiryRows)
    } catch (err) {
      setError(err.message || 'Unable to load follow-ups. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [])

  const counts = useMemo(() => ({
    all: followUps.length,
    pending: followUps.filter((item) => item.status === 'pending').length,
    completed: followUps.filter((item) => item.status === 'completed').length,
    cancelled: followUps.filter((item) => item.status === 'cancelled').length,
  }), [followUps])

  const filteredFollowUps = useMemo(() => {
    const term = search.trim().toLowerCase()
    return followUps.filter((item) => {
      const matchesStatus = filter === 'all' || item.status === filter
      const matchesSearch = !term || [
        item.note,
        item.customer_name,
        item.enquiry_subject,
        item.assigned_to_name,
      ].some((value) => String(value || '').toLowerCase().includes(term))
      return matchesStatus && matchesSearch
    })
  }, [followUps, filter, search])

  async function handleCreate(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await createFollowUp({
        enquiryId: Number(form.enquiryId),
        note: form.note.trim(),
        dueAt: new Date(form.dueAt).toISOString(),
      })
      setShowForm(false)
      setForm({ enquiryId: '', note: '', dueAt: '' })
      setNotice('Follow-up scheduled successfully.')
      await loadData()
    } catch (err) {
      setError(err.message || 'Unable to schedule this follow-up.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(id, status) {
    setError('')
    setNotice('')
    try {
      await updateFollowUp(id, { status })
      setFollowUps((current) =>
        current.map((item) => item.id === id
          ? { ...item, status }
          : item),
      )
      setNotice('Follow-up status updated.')
    } catch (err) {
      setError(err.message || 'Unable to update follow-up status.')
    }
  }

  async function handleDelete(item) {
    if (!window.confirm('Delete this follow-up? This action cannot be undone.')) return
    setError('')
    setNotice('')
    try {
      await deleteFollowUp(item.id)
      setFollowUps((current) => current.filter((row) => row.id !== item.id))
      setNotice('Follow-up deleted.')
    } catch (err) {
      setError(err.message || 'Unable to delete this follow-up.')
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-inkberry/45">
            Customer relationships
          </p>
          <h1 className="mt-1 text-2xl font-bold text-inkberry">Follow-ups</h1>
          <p className="mt-1 text-sm text-inkberry/60">
            Keep every customer conversation moving forward.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError('')
            setShowForm(true)
          }}
          className="rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory transition hover:bg-inkberry/90"
        >
          Schedule follow-up
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-inkberry/15 bg-peach-sand/40 px-4 py-3 text-sm text-inkberry">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl bg-peach-sand/50 px-4 py-3 text-sm text-inkberry">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['All follow-ups', counts.all, 'all'],
          ['Pending', counts.pending, 'pending'],
          ['Completed', counts.completed, 'completed'],
          ['Cancelled', counts.cancelled, 'cancelled'],
        ].map(([label, count, key]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-2xl border p-4 text-left transition ${
              filter === key
                ? 'border-inkberry bg-peach-sand/40'
                : 'border-inkberry/10 bg-white hover:border-inkberry/25'
            }`}
          >
            <p className="text-xs font-medium text-inkberry/55">{label}</p>
            <p className="mt-2 text-2xl font-bold text-inkberry">{count}</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-inkberry/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-inkberry/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-inkberry">Scheduled follow-ups</h2>
            <p className="mt-1 text-xs text-inkberry/50">
              {filteredFollowUps.length} record{filteredFollowUps.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search follow-ups..."
              aria-label="Search follow-ups"
              className="min-w-0 rounded-xl border border-inkberry/15 bg-warm-ivory/50 px-3 py-2 text-sm text-inkberry outline-none placeholder:text-inkberry/40 focus:border-inkberry/40"
            />
            <button
              type="button"
              onClick={loadData}
              className="rounded-xl border border-inkberry/15 px-3 py-2 text-sm font-medium text-inkberry hover:bg-warm-ivory"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-inkberry/55">Loading follow-ups...</p>
        ) : filteredFollowUps.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-inkberry">No follow-ups found</p>
            <p className="mt-2 text-sm text-inkberry/55">
              Schedule a follow-up to make sure no customer enquiry is forgotten.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-inkberry/10">
            {filteredFollowUps.map((item) => (
              <article key={item.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-inkberry">
                      <Link to={`/follow-ups/${item.id}`} className="hover:underline">
                        {item.customer_name || 'Customer'}
                      </Link>
                    </h3>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyles[item.status] || statusStyles.pending}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-inkberry/65">
                    {item.enquiry_subject || 'Enquiry'}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-inkberry/80">
                    {item.note}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-inkberry/50">
                    <span>Due: {formatDate(item.due_at)}</span>
                    <span>Assigned to: {item.assigned_to_name || 'Unassigned'}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <select
                    aria-label={`Update status for follow-up ${item.id}`}
                    value={item.status}
                    onChange={(event) => handleStatusChange(item.id, event.target.value)}
                    className="rounded-lg border border-inkberry/15 bg-white px-3 py-2 text-xs text-inkberry outline-none focus:border-inkberry/40"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="rounded-lg border border-inkberry/15 px-3 py-2 text-xs font-medium text-inkberry/65 hover:bg-peach-sand/40"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="follow-up-form-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-warm-ivory p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="follow-up-form-title" className="text-xl font-bold text-inkberry">
                  Schedule a follow-up
                </h2>
                <p className="mt-1 text-sm text-inkberry/55">
                  Choose an enquiry and set the next contact date.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close form"
                className="rounded-lg px-2 py-1 text-xl text-inkberry/60 hover:bg-peach-sand/50"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label htmlFor="follow-up-enquiry" className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Related enquiry
                </label>
                <select
                  id="follow-up-enquiry"
                  required
                  value={form.enquiryId}
                  onChange={(event) => setForm({ ...form, enquiryId: event.target.value })}
                  className="w-full rounded-xl border border-inkberry/15 bg-white px-3 py-3 text-sm text-inkberry outline-none focus:border-inkberry/40"
                >
                  <option value="">Select an enquiry</option>
                  {enquiries.map((enquiry) => (
                    <option key={enquiry.id} value={enquiry.id}>
                      {enquiry.subject} — {enquiry.customer_name || 'Customer'}
                    </option>
                  ))}
                </select>
                {enquiries.length === 0 && (
                  <p className="mt-1 text-xs text-inkberry/55">
                    Create an enquiry before scheduling a follow-up.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="follow-up-note" className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Follow-up note
                </label>
                <textarea
                  id="follow-up-note"
                  required
                  minLength={1}
                  maxLength={2000}
                  rows={4}
                  value={form.note}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                  placeholder="What should happen during this follow-up?"
                  className="w-full rounded-xl border border-inkberry/15 bg-white px-3 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/40 focus:border-inkberry/40"
                />
              </div>

              <div>
                <label htmlFor="follow-up-due" className="mb-1.5 block text-sm font-semibold text-inkberry">
                  Due date and time
                </label>
                <input
                  id="follow-up-due"
                  type="datetime-local"
                  required
                  min={toLocalDateTime(new Date())}
                  value={form.dueAt}
                  onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
                  className="w-full rounded-xl border border-inkberry/15 bg-white px-3 py-3 text-sm text-inkberry outline-none focus:border-inkberry/40"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-inkberry/15 px-4 py-3 text-sm font-semibold text-inkberry hover:bg-peach-sand/40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || enquiries.length === 0}
                  className="rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Scheduling...' : 'Schedule follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
