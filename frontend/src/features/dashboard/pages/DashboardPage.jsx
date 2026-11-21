import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext.jsx'
import { getDashboardData } from '../services/dashboard.service.js'

function formatDate(value) {
  if (!value) return 'Date unavailable'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Date unavailable'

  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function Status({ value }) {
  const styles = {
    new: 'bg-peach-sand text-inkberry',
    contacted: 'bg-inkberry/10 text-inkberry',
    qualified: 'bg-inkberry/10 text-inkberry',
    converted: 'bg-peach-sand text-inkberry',
    lost: 'bg-inkberry/5 text-inkberry/60',
  }

  return (
    <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${styles[value] || 'bg-inkberry/5 text-inkberry/60'}`}>
      {value || 'Unknown'}
    </span>
  )
}

function MetricCard({ label, value, note }) {
  return (
    <article className="min-w-0 rounded-xl border border-inkberry/10 bg-white p-4 sm:p-5">
      <p className="text-xs font-medium text-inkberry/60 sm:text-sm">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-inkberry sm:mt-4 sm:text-3xl">
        {value ?? 0}
      </p>
      <p className="mt-2 text-[11px] text-inkberry/45 sm:text-xs">{note}</p>
    </article>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    try {
      const data = await getDashboardData()
      setDashboard(data)
    } catch (err) {
      setError(err.message || 'Unable to load your dashboard.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadDashboard)
  }, [loadDashboard])

  const firstName = user?.name?.trim()?.split(/\s+/)[0] || 'there'
  const summary = dashboard?.summary
  const enquiries = dashboard?.enquiries?.slice(0, 5) || []
  const followUps = dashboard?.followUps?.slice(0, 5) || []

  return (
    <div className="mx-auto max-w-7xl">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-inkberry/50">
            Your business at a glance
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-inkberry sm:text-3xl">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-2 text-sm text-inkberry/60">
            Here's what is happening with your customer relationships.
          </p>
        </div>

        <Link
          to="/customers"
          className="inline-flex w-fit items-center justify-center rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90"
        >
          Add customer
        </Link>
      </section>

      {error && (
        <div className="mt-7 rounded-lg border border-inkberry/15 bg-white p-4">
          <p className="text-sm text-inkberry">{error}</p>
          <button
            type="button"
            onClick={loadDashboard}
            className="mt-3 text-sm font-semibold text-inkberry underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      )}

      <section className="mt-7 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Total customers"
          value={isLoading ? '—' : summary?.totalCustomers}
          note="Customer records"
        />
        <MetricCard
          label="Total enquiries"
          value={isLoading ? '—' : summary?.totalEnquiries}
          note="All recorded enquiries"
        />
        <MetricCard
          label="Pending follow-ups"
          value={isLoading ? '—' : summary?.pendingFollowUps}
          note="Awaiting completion"
        />
        <MetricCard
          label="Overdue follow-ups"
          value={isLoading ? '—' : summary?.overdueFollowUps}
          note="Need your attention"
        />
      </section>

      <section className="mt-6 grid min-w-0 gap-4 sm:mt-7 sm:gap-5 lg:grid-cols-[1.5fr_1fr]">
        <article className="min-w-0 rounded-xl border border-inkberry/10 bg-white p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-inkberry sm:text-lg">
                Recent enquiries
              </h2>
              <p className="mt-1 text-xs text-inkberry/50 sm:text-sm">
                The latest interest from your customers.
              </p>
            </div>
            <Link
              to="/enquiries"
              className="shrink-0 text-xs font-semibold text-inkberry underline underline-offset-4 sm:text-sm"
            >
              View all
            </Link>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-inkberry/50">
              Loading enquiries...
            </p>
          ) : enquiries.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-inkberry">
                No enquiries yet
              </p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-inkberry/50">
                New customer enquiries will appear here when they are recorded.
              </p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-inkberry/10">
              {enquiries.map((enquiry) => (
                <div
                  key={enquiry.id}
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-inkberry">
                      {enquiry.subject || 'Customer enquiry'}
                    </p>
                    <p className="mt-1 text-sm text-inkberry/55">
                      {enquiry.customer_name || 'Customer'}
                    </p>
                    <p className="mt-1 text-xs text-inkberry/40">
                      {formatDate(enquiry.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Status value={enquiry.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-xl border border-inkberry/10 bg-white p-4 sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-inkberry sm:text-lg">
              Upcoming follow-ups
            </h2>
            <p className="mt-1 text-xs text-inkberry/50 sm:text-sm">
              Conversations that need your attention.
            </p>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-inkberry/50">
              Loading follow-ups...
            </p>
          ) : followUps.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-inkberry">
                Nothing scheduled yet
              </p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-inkberry/50">
                Your upcoming customer follow-ups will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-inkberry/10">
              {followUps.map((followUp) => (
                <div key={followUp.id} className="py-4">
                  <p className="text-sm font-semibold text-inkberry">
                    {followUp.customerName || 'Customer'}
                  </p>
                  <p className="mt-1 text-sm text-inkberry/55">
                    {followUp.enquirySubject || followUp.note || 'Follow-up'}
                  </p>
                  <p className="mt-2 text-[11px] text-inkberry/45 sm:text-xs">
                    Due {formatDate(followUp.dueAt)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <Link
            to="/follow-ups"
            className="mt-3 inline-block text-sm font-semibold text-inkberry underline underline-offset-4"
          >
            View all follow-ups
          </Link>
        </article>
      </section>

      <section className="mt-5 rounded-xl bg-peach-sand p-5 sm:mt-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/60">
          The Beevo promise
        </p>
        <h2 className="mt-2 text-xl font-semibold text-inkberry">
          Every enquiry deserves a follow-up.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-inkberry/70">
          Organise your customers, manage enquiries and build stronger business
          relationships from one workspace.
        </p>
      </section>
    </div>
  )
}
