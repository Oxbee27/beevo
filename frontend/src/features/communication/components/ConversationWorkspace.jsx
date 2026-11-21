import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import {
  classifyConversation,
  getConversation,
  getConversations,
  getPendingConversation,
  getPendingConversations,
} from '../services/communication.service.js'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function contactName(item = {}) {
  return item.contact_display_name || item.contact_identifier || 'Unknown contact'
}

function ErrorMessage({ children }) {
  return children ? (
    <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {children}
    </p>
  ) : null
}

export default function ConversationWorkspace() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'

  const [pending, setPending] = useState([])
  const [pendingLoading, setPendingLoading] = useState(isOwner)
  const [pendingError, setPendingError] = useState('')
  const [selectedPending, setSelectedPending] = useState(null)
  const [pendingDetail, setPendingDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [confirmExclude, setConfirmExclude] = useState(false)

  const [conversations, setConversations] = useState([])
  const [conversationLoading, setConversationLoading] = useState(true)
  const [conversationError, setConversationError] = useState('')
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [conversationDetail, setConversationDetail] = useState(null)
  const [conversationDetailLoading, setConversationDetailLoading] = useState(false)

  const loadPending = useCallback(async () => {
    if (!isOwner) return
    setPendingLoading(true)
    setPendingError('')
    try {
      const result = await getPendingConversations({ page: 1, limit: 20 })
      setPending(result?.conversations || [])
    } catch (error) {
      setPendingError(error.message || 'Unable to load pending messages.')
      setPending([])
    } finally {
      setPendingLoading(false)
    }
  }, [isOwner])

  const loadConversations = useCallback(async () => {
    setConversationLoading(true)
    setConversationError('')
    try {
      const result = await getConversations({
        classification: 'business',
        page: 1,
        limit: 20,
      })
      setConversations(result?.conversations || [])
    } catch (error) {
      setConversationError(
        error.status === 403
          ? 'Your account does not have permission to view tracked conversations.'
          : error.message || 'Unable to load tracked conversations.',
      )
      setConversations([])
    } finally {
      setConversationLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadPending)
  }, [loadPending])

  useEffect(() => {
    void Promise.resolve().then(loadConversations)
  }, [loadConversations])

  async function openPending(id) {
    setSelectedPending(id)
    setPendingDetail(null)
    setConfirmExclude(false)
    setDetailLoading(true)
    setPendingError('')
    try {
      setPendingDetail(await getPendingConversation(id))
    } catch (error) {
      setPendingError(error.message || 'Unable to open this conversation.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function classifySelected(classification) {
    if (!selectedPending || classifying) return
    setClassifying(true)
    setPendingError('')
    try {
      await classifyConversation(selectedPending, classification)
      setSelectedPending(null)
      setPendingDetail(null)
      setConfirmExclude(false)
      await Promise.all([loadPending(), loadConversations()])
    } catch (error) {
      setPendingError(error.message || 'Unable to update classification.')
    } finally {
      setClassifying(false)
    }
  }

  async function openTracked(id) {
    setSelectedConversation(id)
    setConversationDetail(null)
    setConversationDetailLoading(true)
    setConversationError('')
    try {
      setConversationDetail(await getConversation(id))
    } catch (error) {
      setConversationError(error.message || 'Unable to open this conversation.')
    } finally {
      setConversationDetailLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {isOwner && (
        <section className="overflow-hidden rounded-2xl border border-inkberry/10 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-inkberry/10 p-4 sm:p-5">
            <div>
              <h2 className="font-semibold text-inkberry">Pending conversation inbox</h2>
              <p className="mt-1 text-sm text-inkberry/55">
                Review incoming WhatsApp messages before adding them to business records.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {pending.length} awaiting review
              </span>
              <button type="button" onClick={() => void loadPending()}
                className="rounded-lg border border-inkberry/15 px-3 py-2 text-sm font-semibold text-inkberry">
                Refresh
              </button>
            </div>
          </header>

          <div className="px-4 sm:px-5">
            <ErrorMessage>{pendingError}</ErrorMessage>
          </div>

          {pendingLoading ? (
            <p className="p-6 text-sm text-inkberry/55">Loading pending conversations…</p>
          ) : pending.length === 0 ? (
            <p className="p-6 text-center text-sm text-inkberry/55">
              No messages are awaiting review.
            </p>
          ) : (
            <div className="grid min-w-0 lg:grid-cols-2">
              <div className="divide-y divide-inkberry/5 lg:border-r lg:border-inkberry/10">
                {pending.map((item) => (
                  <button key={item.id} type="button"
                    onClick={() => void openPending(item.id)}
                    className={`block w-full min-w-0 p-4 text-left hover:bg-warm-ivory/60 ${
                      selectedPending === item.id ? 'bg-peach-sand/30' : ''
                    }`}>
                    <div className="flex justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-inkberry">
                        {contactName(item)}
                      </span>
                      <span className="shrink-0 text-xs text-inkberry/45">
                        {item.pending_count} message(s)
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-inkberry/60">
                      {item.latest_message_preview || 'Incoming message'}
                    </p>
                    <p className="mt-2 text-xs text-inkberry/40">
                      WhatsApp · {formatDate(item.latest_received_at)}
                    </p>
                  </button>
                ))}
              </div>

              <div className="min-w-0 p-4 sm:p-5">
                {!selectedPending ? (
                  <p className="py-8 text-center text-sm text-inkberry/50">
                    Select a conversation to review its messages.
                  </p>
                ) : detailLoading ? (
                  <p className="py-8 text-center text-sm text-inkberry/50">
                    Loading conversation…
                  </p>
                ) : pendingDetail ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-inkberry">
                          {contactName(pendingDetail.conversation)}
                        </h3>
                        <p className="mt-1 break-all text-xs text-inkberry/50">
                          {pendingDetail.conversation?.contact_identifier}
                        </p>
                      </div>
                      <button type="button"
                        onClick={() => { setSelectedPending(null); setPendingDetail(null) }}
                        className="text-sm font-semibold text-inkberry/55">
                        Close
                      </button>
                    </div>

                    <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl bg-warm-ivory p-3">
                      {(pendingDetail.messages || []).map((message) => (
                        <article key={message.id} className="rounded-xl bg-white p-3">
                          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-inkberry">
                            {message.body || `[${message.message_type || 'Message'}]`}
                          </p>
                          <p className="mt-2 text-right text-xs text-inkberry/40">
                            {formatDate(message.received_at)}
                          </p>
                        </article>
                      ))}
                    </div>

                    <div className="mt-4 rounded-xl border border-inkberry/10 p-3">
                      <p className="text-sm font-semibold text-inkberry">Classify conversation</p>
                      <p className="mt-1 text-xs leading-5 text-inkberry/55">
                        Approving moves messages into tracked conversations. Excluding deletes their pending content.
                      </p>

                      {confirmExclude ? (
                        <div className="mt-3 rounded-lg bg-red-50 p-3">
                          <p className="text-sm font-semibold text-red-800">
                            Permanently delete these pending messages?
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={classifying}
                              onClick={() => void classifySelected('excluded')}
                              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                              {classifying ? 'Saving…' : 'Confirm exclusion'}
                            </button>
                            <button type="button" disabled={classifying}
                              onClick={() => setConfirmExclude(false)}
                              className="rounded-lg border border-inkberry/15 px-3 py-2 text-sm font-semibold text-inkberry">
                              Keep for review
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <button type="button" disabled={classifying}
                            onClick={() => void classifySelected('business')}
                            className="rounded-lg bg-inkberry px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                            {classifying ? 'Saving…' : 'Approve as business'}
                          </button>
                          <button type="button" disabled={classifying}
                            onClick={() => setConfirmExclude(true)}
                            className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">
                            Exclude and delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-inkberry/50">
                    Unable to display this conversation.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-inkberry/10 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-inkberry/10 p-4 sm:p-5">
          <div>
            <h2 className="font-semibold text-inkberry">Tracked conversations</h2>
            <p className="mt-1 text-sm text-inkberry/55">
              Business conversations approved for customer communication records.
            </p>
          </div>
          <button type="button" onClick={() => void loadConversations()}
            className="rounded-lg border border-inkberry/15 px-3 py-2 text-sm font-semibold text-inkberry">
            Refresh
          </button>
        </header>

        <div className="px-4 sm:px-5">
          <ErrorMessage>{conversationError}</ErrorMessage>
        </div>

        {conversationLoading ? (
          <p className="p-6 text-sm text-inkberry/55">Loading tracked conversations…</p>
        ) : conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-inkberry/55">
            No approved business conversations have been recorded yet.
          </p>
        ) : (
          <div className="grid min-w-0 lg:grid-cols-2">
            <div className="divide-y divide-inkberry/5 lg:border-r lg:border-inkberry/10">
              {conversations.map((item) => (
                <button key={item.id} type="button"
                  onClick={() => void openTracked(item.id)}
                  className={`block w-full min-w-0 p-4 text-left hover:bg-warm-ivory/60 ${
                    selectedConversation === item.id ? 'bg-peach-sand/30' : ''
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-inkberry">
                      {contactName(item)}
                    </span>
                    <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                      {item.conversation_status || 'open'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-inkberry/60">
                    {item.last_message_preview || 'No message preview'}
                  </p>
                  <p className="mt-2 text-xs text-inkberry/40">
                    {item.channel || 'Channel'} · {item.message_count ?? 0} messages · {formatDate(item.last_message_at || item.updated_at)}
                  </p>
                </button>
              ))}
            </div>

            <div className="min-w-0 p-4 sm:p-5">
              {!selectedConversation ? (
                <p className="py-8 text-center text-sm text-inkberry/50">
                  Select a tracked conversation to view its history.
                </p>
              ) : conversationDetailLoading ? (
                <p className="py-8 text-center text-sm text-inkberry/50">
                  Loading conversation history…
                </p>
              ) : conversationDetail ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-inkberry">
                        {contactName(conversationDetail.conversation)}
                      </h3>
                      <p className="mt-1 break-all text-xs text-inkberry/50">
                        {conversationDetail.conversation?.contact_identifier}
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => { setSelectedConversation(null); setConversationDetail(null) }}
                      className="text-sm font-semibold text-inkberry/55">
                      Close
                    </button>
                  </div>

                  <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-xl bg-warm-ivory p-3">
                    {(conversationDetail.messages || []).map((message) => (
                      <article key={message.id}
                        className={`rounded-xl border border-inkberry/10 bg-white p-3 ${
                          message.direction === 'outbound' ? 'ml-4 sm:ml-10' : 'mr-4 sm:mr-10'
                        }`}>
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-xs font-semibold uppercase text-inkberry/50">
                            {message.direction || 'message'} · {message.delivery_status || message.message_type || 'recorded'}
                          </span>
                          <span className="text-xs text-inkberry/40">
                            {formatDate(message.received_at || message.sent_at || message.created_at)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-inkberry">
                          {message.body || `[${message.message_type || 'Message'}]`}
                        </p>
                      </article>
                    ))}
                    {(conversationDetail.messages || []).length === 0 && (
                      <p className="py-6 text-center text-sm text-inkberry/50">
                        No messages in this conversation.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-inkberry/50">
                  Unable to display this conversation.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
