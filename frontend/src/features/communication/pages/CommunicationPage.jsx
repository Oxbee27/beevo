import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import {
  cancelCommunicationMessage,
  getCommunicationChannels,
  getCommunicationMessage,
  getCommunicationMessages,
  getCommunicationsOverview,
  retryCommunicationMessage,
} from '../services/communication.service.js'

const channels = ['email', 'sms', 'whatsapp']

const statuses = [
  'pending',
  'processing',
  'sent',
  'delivered',
  'failed',
  'cancelled',
  'unknown',
  'billing_blocked',
]

function formatLabel(value) {
  if (!value) return 'Unknown'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function StatusBadge({ status }) {
  const styles = {
    delivered: 'bg-green-50 text-green-700',
    sent: 'bg-blue-50 text-blue-700',
    pending: 'bg-amber-50 text-amber-700',
    processing: 'bg-blue-50 text-blue-700',
    failed: 'bg-red-50 text-red-700',
    billing_blocked: 'bg-red-50 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
    unknown: 'bg-gray-100 text-gray-600',
  }

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {formatLabel(status)}
    </span>
  )
}

function ChannelIcon({ channel }) {
  const labels = {
    email: 'E',
    sms: 'S',
    whatsapp: 'W',
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-peach-sand text-sm font-bold uppercase text-inkberry">
      {labels[channel] || '?'}
    </span>
  )
}

function MetricCard({ label, value, description }) {
  return (
    <div className="rounded-2xl border border-inkberry/10 bg-white p-5">
      <p className="text-sm font-medium text-inkberry/55">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-inkberry">
        {value ?? 0}
      </p>
      {description && (
        <p className="mt-1 text-xs text-inkberry/45">{description}</p>
      )}
    </div>
  )
}

function ChannelCard({ name, readiness }) {
  const configured = readiness?.configured === true

  return (
    <div className="rounded-2xl border border-inkberry/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ChannelIcon channel={name} />
          <div>
            <h3 className="font-semibold capitalize text-inkberry">{name}</h3>
            <p className="text-xs text-inkberry/50">Delivery channel</p>
          </div>
        </div>

        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          configured
            ? 'bg-green-50 text-green-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {configured ? 'Configured' : 'Not configured'}
        </span>
      </div>
    </div>
  )
}

function MessageDetails({ message, onClose, onCancel, onRetry, busy }) {
  if (!message) return null

  const canCancel = message.status === 'pending'
  const canRetry = ['failed', 'billing_blocked'].includes(message.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-warm-ivory p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-inkberry/45">
              Communication record
            </p>
            <h2 className="mt-1 text-xl font-bold text-inkberry">
              Message #{message.id}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-xl text-inkberry/60 hover:bg-inkberry/5"
            aria-label="Close message details"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-4">
            <p className="text-xs text-inkberry/50">Channel</p>
            <p className="mt-1 font-semibold capitalize text-inkberry">
              {message.channel}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4">
            <p className="text-xs text-inkberry/50">Status</p>
            <div className="mt-1">
              <StatusBadge status={message.status} />
            </div>
          </div>
          <div className="rounded-xl bg-white p-4 sm:col-span-2">
            <p className="text-xs text-inkberry/50">Recipient</p>
            <p className="mt-1 break-all font-medium text-inkberry">
              {message.recipient || '—'}
            </p>
          </div>
          {message.subject && (
            <div className="rounded-xl bg-white p-4 sm:col-span-2">
              <p className="text-xs text-inkberry/50">Subject</p>
              <p className="mt-1 font-medium text-inkberry">{message.subject}</p>
            </div>
          )}
          <div className="rounded-xl bg-white p-4 sm:col-span-2">
            <p className="text-xs text-inkberry/50">Message content</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-inkberry/80">
              {message.body || 'No message content available.'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <p className="text-inkberry/65">
            Scheduled: <span className="font-medium text-inkberry">{formatDate(message.scheduled_for)}</span>
          </p>
          <p className="text-inkberry/65">
            Next attempt: <span className="font-medium text-inkberry">{formatDate(message.next_attempt_at)}</span>
          </p>
          <p className="text-inkberry/65">
            Attempts: <span className="font-medium text-inkberry">{message.attempt_count ?? 0} / {message.max_attempts ?? 0}</span>
          </p>
          <p className="text-inkberry/65">
            Provider: <span className="font-medium text-inkberry">{message.provider || '—'}</span>
          </p>
          <p className="text-inkberry/65">
            Sent: <span className="font-medium text-inkberry">{formatDate(message.sent_at)}</span>
          </p>
          <p className="text-inkberry/65">
            Delivered: <span className="font-medium text-inkberry">{formatDate(message.delivered_at)}</span>
          </p>
        </div>

        {message.last_error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold text-red-700">Latest delivery issue</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-red-700">
              {message.last_error}
            </p>
          </div>
        )}

        <div className="mt-6">
          <h3 className="font-semibold text-inkberry">Delivery attempts</h3>
          {message.attempts?.length ? (
            <div className="mt-3 space-y-2">
              {message.attempts.map((attempt) => (
                <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                  <div>
                    <p className="text-sm font-semibold text-inkberry">
                      Attempt {attempt.attempt_number}
                    </p>
                    <p className="text-xs text-inkberry/50">
                      {attempt.provider || 'Provider not recorded'} · {formatDate(attempt.attempted_at)}
                    </p>
                    {attempt.error_message && (
                      <p className="mt-1 text-xs text-red-600">{attempt.error_message}</p>
                    )}
                  </div>
                  <StatusBadge status={attempt.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-inkberry/50">
              No provider delivery attempts have been recorded.
            </p>
          )}
        </div>

        {(canCancel || canRetry) && (
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-inkberry/10 pt-5">
            {canCancel && (
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="rounded-xl border border-inkberry/20 px-4 py-2.5 text-sm font-semibold text-inkberry hover:bg-inkberry/5 disabled:opacity-50"
              >
                Cancel message
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                disabled={busy}
                onClick={onRetry}
                className="rounded-xl bg-inkberry px-4 py-2.5 text-sm font-semibold text-white hover:bg-inkberry/90 disabled:opacity-50"
              >
                Retry delivery
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommunicationPage() {
  const [overview, setOverview] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [messages, setMessages] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })
  const [filters, setFilters] = useState({
    channel: '',
    status: '',
    from: '',
    to: '',
  })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false)

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await getCommunicationMessages({
        ...filters,
        page,
        limit: 20,
      })
      setMessages(result.messages)
      setPagination(result.pagination)
    } catch (err) {
      setError(err.message || 'Unable to load communication history.')
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const loadSummary = useCallback(async () => {
    setOverviewLoading(true)

    try {
      const [overviewResult, readinessResult] = await Promise.all([
        getCommunicationsOverview(),
        getCommunicationChannels(),
      ])
      setOverview(overviewResult)
      setReadiness(readinessResult)
    } catch (err) {
      setActionError(err.message || 'Unable to load communication information.')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadSummary)
  }, [loadSummary])

  useEffect(() => {
    void Promise.resolve().then(loadMessages)
  }, [loadMessages])

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
    setPage(1)
  }

  async function openMessage(id) {
    setActionError('')

    try {
      const message = await getCommunicationMessage(id)
      setSelectedMessage(message)
    } catch (err) {
      setActionError(err.message || 'Unable to open this message.')
    }
  }

  async function handleMessageAction(action) {
    if (!selectedMessage || busy) return

    setBusy(true)
    setActionError('')

    try {
      if (action === 'cancel') {
        await cancelCommunicationMessage(selectedMessage.id)
      } else {
        await retryCommunicationMessage(selectedMessage.id)
      }

      setSelectedMessage(null)
      setShowCancelConfirmation(false)
      await Promise.all([loadMessages(), loadSummary()])
    } catch (err) {
      setActionError(err.message || 'The message could not be updated.')
      return false
    } finally {
      setBusy(false)
    }

    return true
  }

  const totals = overview?.totals || {}
  const deliveryRate = overview?.deliveryRate

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-inkberry/45">
          Beevo workspace
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-inkberry sm:text-3xl">
              Communication
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-inkberry/60">
              Monitor customer messages across your channels, review delivery activity and manage messages that need attention.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadSummary()
              void loadMessages()
            }}
            className="rounded-xl border border-inkberry/15 bg-white px-4 py-2.5 text-sm font-semibold text-inkberry hover:bg-inkberry/5"
          >
            Refresh
          </button>
        </div>
      </div>

      {actionError && !selectedMessage && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-inkberry">Message overview</h2>
          {overviewLoading && (
            <span className="text-xs text-inkberry/45">Updating…</span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total messages" value={totals.total} description="All recorded communication messages" />
          <MetricCard label="Delivered" value={totals.delivered} description="Successfully delivered messages" />
          <MetricCard label="Failed" value={totals.failed} description="Messages requiring attention" />
          <MetricCard
            label="Delivery rate"
            value={deliveryRate === null || deliveryRate === undefined ? '—' : `${deliveryRate}%`}
            description="Delivered compared with delivered and failed"
          />
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-semibold text-inkberry">Channel readiness</h2>
          <p className="mt-1 text-sm text-inkberry/55">
            Check which communication channels are configured for delivery.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel}
              name={channel}
              readiness={readiness?.channels?.[channel]}
            />
          ))}
        </div>
        {readiness?.webhooks && (
          <div className="mt-3 rounded-xl border border-inkberry/10 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-inkberry/65">Delivery webhook readiness</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-inkberry/65">
              {Object.entries(readiness.webhooks).map(([provider, configured]) => (
                <span key={provider}>
                  <span className="font-semibold uppercase">{provider}:</span>{' '}
                  {configured ? 'Configured' : 'Not configured'}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-inkberry/10 bg-white">
        <div className="border-b border-inkberry/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-inkberry">Message history</h2>
              <p className="mt-1 text-sm text-inkberry/55">
                Review scheduled messages and their delivery status.
              </p>
            </div>
            <span className="text-sm text-inkberry/50">
              {pagination.total} messages
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-inkberry/65">
              Channel
              <select
                value={filters.channel}
                onChange={(event) => updateFilter('channel', event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-inkberry/15 bg-white px-3 py-2.5 text-sm font-normal text-inkberry outline-none focus:border-inkberry"
              >
                <option value="">All channels</option>
                {channels.map((channel) => (
                  <option key={channel} value={channel}>{formatLabel(channel)}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-inkberry/65">
              Status
              <select
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-inkberry/15 bg-white px-3 py-2.5 text-sm font-normal text-inkberry outline-none focus:border-inkberry"
              >
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>{formatLabel(status)}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-inkberry/65">
              From date
              <input
                type="date"
                value={filters.from}
                onChange={(event) => updateFilter('from', event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-inkberry/15 bg-white px-3 py-2.5 text-sm font-normal text-inkberry outline-none focus:border-inkberry"
              />
            </label>

            <label className="text-xs font-semibold text-inkberry/65">
              To date
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) => updateFilter('to', event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-inkberry/15 bg-white px-3 py-2.5 text-sm font-normal text-inkberry outline-none focus:border-inkberry"
              />
            </label>
          </div>
        </div>

        {error && (
          <div role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-inkberry/55">
            Loading communication history…
          </div>
        ) : messages.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-semibold text-inkberry">No messages found</h3>
            <p className="mt-2 text-sm text-inkberry/55">
              Messages will appear here when customer follow-ups are scheduled.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-warm-ivory text-xs uppercase tracking-wide text-inkberry/55">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Message</th>
                    <th className="px-5 py-3 font-semibold">Recipient</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Attempts</th>
                    <th className="px-5 py-3 font-semibold">Created</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inkberry/5">
                  {messages.map((message) => (
                    <tr key={message.id} className="hover:bg-warm-ivory/60">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <ChannelIcon channel={message.channel} />
                          <div>
                            <p className="text-sm font-semibold text-inkberry">
                              {formatLabel(message.channel)}
                            </p>
                            <p className="text-xs text-inkberry/45">
                              Message #{message.id}
                              {message.follow_up_id ? ` · Follow-up #${message.follow_up_id}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate px-5 py-4 text-sm text-inkberry/70">
                        {message.recipient || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={message.status} />
                      </td>
                      <td className="px-5 py-4 text-sm tabular-nums text-inkberry/70">
                        {message.attempt_count ?? 0} / {message.max_attempts ?? 0}
                      </td>
                      <td className="px-5 py-4 text-sm text-inkberry/60">
                        {formatDate(message.created_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openMessage(message.id)}
                          className="rounded-lg px-3 py-2 text-sm font-semibold text-inkberry hover:bg-peach-sand/50"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-inkberry/10 px-5 py-4">
              <p className="text-xs text-inkberry/55">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-lg border border-inkberry/15 px-3 py-2 text-sm font-semibold text-inkberry disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-inkberry/15 px-3 py-2 text-sm font-semibold text-inkberry disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {showCancelConfirmation && selectedMessage && (
        <ConfirmDialog
          title="Cancel scheduled message?"
          message="This pending message will be cancelled and will no longer be sent."
          confirmLabel="Cancel message"
          loading={busy}
          onCancel={() => setShowCancelConfirmation(false)}
          onConfirm={() => handleMessageAction('cancel')}
        />
      )}

      {selectedMessage && (
        <MessageDetails
          message={selectedMessage}
          onClose={() => setSelectedMessage(null)}
          onCancel={() => {
            setActionError('')
            setShowCancelConfirmation(true)
          }}
          onRetry={() => handleMessageAction('retry')}
          busy={busy}
        />
      )}
    </div>
  )
}
