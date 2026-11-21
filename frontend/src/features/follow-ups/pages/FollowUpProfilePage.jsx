import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import {
  getFollowUp,
  updateFollowUp,
  getFollowUpMessages,
  scheduleFollowUpMessage,
  cancelFollowUpMessage,
  getStaff,
} from '../services/follow-up.service.js'

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
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}

function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `beevo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

const fieldClass = 'w-full rounded-xl border border-inkberry/15 bg-white px-3 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/40 focus:border-inkberry/40'
const labelClass = 'mb-1.5 block text-sm font-semibold text-inkberry'

export default function FollowUpProfilePage() {
  const { id } = useParams()
  const [followUp, setFollowUp] = useState(null)
  const [staff, setStaff] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [cancellingId, setCancellingId] = useState(null)
  const [messageToCancel, setMessageToCancel] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editForm, setEditForm] = useState({
    note: '',
    dueAt: '',
    assignedTo: '',
    status: 'pending',
  })
  const [messageForm, setMessageForm] = useState({
    channel: 'email',
    subject: '',
    body: '',
    scheduledFor: '',
  })

  const loadData = useCallback(async () => {
    try {
      const [record, messageRows, staffRows] = await Promise.all([
        getFollowUp(id),
        getFollowUpMessages(id),
        getStaff(),
      ])

      setFollowUp(record)
      setMessages(messageRows)
      setStaff(staffRows.filter((member) => member.is_active))

      setEditForm({
        note: record.note || '',
        dueAt: toLocalDateTime(record.due_at),
        assignedTo: record.assigned_to ? String(record.assigned_to) : '',
        status: record.status || 'pending',
      })
    } catch (err) {
      setError(err.message || 'Unable to load this follow-up.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [loadData])

  async function handleUpdate(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await updateFollowUp(id, {
        note: editForm.note.trim(),
        dueAt: new Date(editForm.dueAt).toISOString(),
        assignedTo: editForm.assignedTo ? Number(editForm.assignedTo) : null,
        status: editForm.status,
      })
      setNotice('Follow-up details updated successfully.')
      await loadData()
    } catch (err) {
      setError(err.message || 'Unable to update this follow-up.')
    } finally {
      setSaving(false)
    }
  }

  async function handleScheduleMessage(event) {
    event.preventDefault()
    setScheduling(true)
    setError('')
    setNotice('')

    try {
      const payload = {
        channel: messageForm.channel,
        body: messageForm.body.trim(),
        scheduledFor: new Date(messageForm.scheduledFor).toISOString(),
        idempotencyKey: makeIdempotencyKey(),
      }

      if (messageForm.channel === 'email') {
        payload.subject = messageForm.subject.trim()
      }

      await scheduleFollowUpMessage(id, payload)

      setMessageForm({
        channel: 'email',
        subject: '',
        body: '',
        scheduledFor: '',
      })
      setNotice('Message scheduled successfully.')
      const rows = await getFollowUpMessages(id)
      setMessages(rows)
    } catch (err) {
      setError(err.message || 'Unable to schedule this message.')
    } finally {
      setScheduling(false)
    }
  }

  async function handleCancelMessage(messageId) {
    setCancellingId(messageId)
    setError('')
    setNotice('')

    try {
      await cancelFollowUpMessage(messageId)
      setNotice('Scheduled message cancelled.')
      const rows = await getFollowUpMessages(id)
      setMessages(rows)
      return true
    } catch (err) {
      setError(err.message || 'Unable to cancel this message.')
      return false
    } finally {
      setCancellingId(null)
    }
  }

  if (loading) {
    return <p className="p-8 text-center text-sm text-inkberry/55">Loading follow-up...</p>
  }

  if (!followUp) {
    return (
      <section className="space-y-4">
        <p role="alert" className="rounded-xl bg-peach-sand/50 p-4 text-sm text-inkberry">
          {error || 'This follow-up could not be found.'}
        </p>
        <Link to="/follow-ups" className="text-sm font-semibold text-inkberry underline">
          Back to follow-ups
        </Link>
      </section>
    )
  }

  return (
    <section className="w-full min-w-0 space-y-5 pb-10 sm:space-y-6">
      <div>
        <Link to="/follow-ups" className="text-sm font-medium text-inkberry/60 hover:text-inkberry">
          ← Back to follow-ups
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-inkberry/45">
              Follow-up details
            </p>
            <h1 className="mt-1 break-words text-2xl font-bold text-inkberry">
              {followUp.customer_name || 'Customer'}
            </h1>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[followUp.status] || statusStyles.pending}`}>
            {followUp.status}
          </span>
        </div>
        <p className="mt-2 text-sm text-inkberry/60">
          {followUp.enquiry_subject || 'Related enquiry'}
        </p>
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

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-inkberry/10 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-inkberry">Follow-up information</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs text-inkberry/50">Customer</p>
              <p className="mt-1 break-words font-medium text-inkberry">{followUp.customer_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-inkberry/50">Related enquiry</p>
              <p className="mt-1 font-medium text-inkberry">{followUp.enquiry_subject || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-inkberry/50">Created</p>
              <p className="mt-1 break-words text-inkberry">{formatDate(followUp.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-inkberry/50">Last updated</p>
              <p className="mt-1 text-inkberry">{formatDate(followUp.updated_at)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-inkberry/10 bg-white p-5">
          <h2 className="text-lg font-semibold text-inkberry">Edit follow-up</h2>
          <form onSubmit={handleUpdate} className="mt-4 space-y-4">
            <div>
              <label htmlFor="edit-follow-up-note" className={labelClass}>Follow-up note</label>
              <textarea
                id="edit-follow-up-note"
                required
                minLength={1}
                maxLength={2000}
                rows={4}
                value={editForm.note}
                onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="edit-follow-up-date" className={labelClass}>Due date and time</label>
              <input
                id="edit-follow-up-date"
                type="datetime-local"
                required
                value={editForm.dueAt}
                onChange={(event) => setEditForm({ ...editForm, dueAt: event.target.value })}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="edit-follow-up-staff" className={labelClass}>Assign to staff</label>
              <select
                id="edit-follow-up-staff"
                value={editForm.assignedTo}
                onChange={(event) => setEditForm({ ...editForm, assignedTo: event.target.value })}
                className={fieldClass}
              >
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
              {staff.length === 0 && (
                <p className="mt-1 text-xs text-inkberry/50">No active staff members are available.</p>
              )}
            </div>

            <div>
              <label htmlFor="edit-follow-up-status" className={labelClass}>Status</label>
              <select
                id="edit-follow-up-status"
                value={editForm.status}
                onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}
                className={fieldClass}
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90 disabled:opacity-50 sm:w-auto"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-inkberry/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-inkberry">Schedule a customer message</h2>
        <p className="mt-1 text-sm text-inkberry/55">
          Choose a communication channel and schedule when the message should be sent.
        </p>
        <p className="mt-2 rounded-xl bg-peach-sand/35 p-3 text-xs leading-5 text-inkberry/75">
          Beevo checks the customer's channel consent and contact details before accepting a scheduled message.
          The follow-up must also be pending.
        </p>

        <form onSubmit={handleScheduleMessage} className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="message-channel" className={labelClass}>Channel</label>
            <select
              id="message-channel"
              value={messageForm.channel}
              onChange={(event) => setMessageForm({ ...messageForm, channel: event.target.value, subject: '' })}
              className={fieldClass}
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          {messageForm.channel === 'email' && (
            <div>
              <label htmlFor="message-subject" className={labelClass}>Email subject</label>
              <input
                id="message-subject"
                required
                minLength={1}
                maxLength={200}
                value={messageForm.subject}
                onChange={(event) => setMessageForm({ ...messageForm, subject: event.target.value })}
                placeholder="A quick follow-up"
                className={fieldClass}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <label htmlFor="message-body" className={labelClass}>Message</label>
            <textarea
              id="message-body"
              required
              minLength={1}
              maxLength={10000}
              rows={5}
              value={messageForm.body}
              onChange={(event) => setMessageForm({ ...messageForm, body: event.target.value })}
              placeholder="Write the message you want to send to the customer..."
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="message-schedule" className={labelClass}>Send date and time</label>
            <input
              id="message-schedule"
              type="datetime-local"
              required
              min={toLocalDateTime(new Date())}
              value={messageForm.scheduledFor}
              onChange={(event) => setMessageForm({ ...messageForm, scheduledFor: event.target.value })}
              className={fieldClass}
            />
          </div>

          <div className="flex items-end md:col-span-2">
            <button
              type="submit"
              disabled={scheduling || followUp.status !== 'pending'}
              className="w-full rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {scheduling ? 'Scheduling...' : 'Schedule message'}
            </button>
          </div>
          {followUp.status !== 'pending' && (
            <p className="text-xs text-inkberry/55 md:col-span-2">
              Messages can only be scheduled while this follow-up is pending.
            </p>
          )}
        </form>
      </div>

      <div className="rounded-2xl border border-inkberry/10 bg-white">
        <div className="border-b border-inkberry/10 p-5">
          <h2 className="text-lg font-semibold text-inkberry">Message history</h2>
          <p className="mt-1 text-sm text-inkberry/55">
            {messages.length} message{messages.length === 1 ? '' : 's'} associated with this follow-up.
          </p>
        </div>

        {messages.length === 0 ? (
          <p className="p-8 text-center text-sm text-inkberry/55">
            No messages have been scheduled for this follow-up.
          </p>
        ) : (
          <div className="divide-y divide-inkberry/10">
            {messages.map((message) => (
              <article key={message.id} className="min-w-0 space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-peach-sand/50 px-3 py-1 text-xs font-semibold capitalize text-inkberry">
                      {message.channel}
                    </span>
                    <span className="text-sm font-semibold capitalize text-inkberry">
                      {message.status}
                    </span>
                  </div>
                  {message.status === 'pending' && (
                    <button
                      type="button"
                      disabled={cancellingId === message.id}
                      onClick={() => setMessageToCancel(message.id)}
                      className="rounded-lg border border-inkberry/15 px-3 py-2 text-xs font-medium text-inkberry hover:bg-peach-sand/40 disabled:opacity-50"
                    >
                      {cancellingId === message.id ? 'Cancelling...' : 'Cancel message'}
                    </button>
                  )}
                </div>

                {message.subject && (
                  <p className="break-words font-medium text-inkberry">{message.subject}</p>
                )}
                <p className="break-words whitespace-pre-wrap text-sm leading-6 text-inkberry/75">
                  {message.body}
                </p>
                <div className="grid gap-2 text-xs text-inkberry/55 sm:grid-cols-2">
                  <p>Recipient: {message.recipient || '—'}</p>
                  <p>Scheduled: {formatDate(message.scheduled_for)}</p>
                  <p>Sent: {formatDate(message.sent_at)}</p>
                  <p>Delivered: {formatDate(message.delivered_at)}</p>
                  <p>Attempts: {message.attempt_count ?? 0} / {message.max_attempts ?? '—'}</p>
                </div>
                {message.last_error && (
                  <p className="rounded-lg bg-peach-sand/35 p-3 text-xs text-inkberry/75">
                    Delivery note: {message.last_error}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {messageToCancel !== null && (
        <ConfirmDialog
          title="Cancel scheduled message?"
          message="This scheduled message will be cancelled and will no longer be sent."
          confirmLabel="Cancel message"
          loading={cancellingId === messageToCancel}
          onCancel={() => setMessageToCancel(null)}
          onConfirm={async () => {
            if (await handleCancelMessage(messageToCancel)) {
              setMessageToCancel(null)
            }
          }}
        />
      )}
    </section>
  )
}
