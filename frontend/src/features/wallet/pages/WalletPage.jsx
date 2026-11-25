import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  getBusinessWallet,
  getWalletTransactions,
  initializeWalletFunding,
  verifyWalletFunding,
} from '../services/wallet.service.js'

const moneyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatNaira(kobo = '0') {
  try {
    const amount = BigInt(kobo || '0')
    const naira = amount / 100n
    const remainder = (amount % 100n).toString().padStart(2, '0')

    return moneyFormatter.format(Number(naira) + Number(remainder) / 100)
  } catch {
    return '₦0.00'
  }
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function friendlyError(error) {
  if (error.status === 403) {
    return 'Wallet management is available to the business owner only.'
  }

  return error.message || 'Something went wrong. Please try again.'
}

function WalletPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const processedReference = useRef('')

  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  })

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [fundingOpen, setFundingOpen] = useState(false)
  const [fundingAmount, setFundingAmount] = useState('')
  const [fundingLoading, setFundingLoading] = useState(false)
  const [fundingError, setFundingError] = useState('')

  const loadWalletData = useCallback(async (page = 1, showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const [walletResult, transactionResult] = await Promise.allSettled([
        getBusinessWallet(),
        getWalletTransactions(page, 20),
      ])

      if (walletResult.status === 'rejected') {
        throw walletResult.reason
      }

      setWallet(walletResult.value)

      if (transactionResult.status === 'fulfilled') {
        setTransactions(transactionResult.value.transactions || [])
        setPagination(transactionResult.value.pagination || {
          page,
          limit: 20,
          total: 0,
          totalPages: 1,
        })
      } else {
        setTransactions([])
      }
    } catch (requestError) {
      setError(friendlyError(requestError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const hasPaymentReference =
      params.has('reference') || params.has('trxref')

    if (!hasPaymentReference) {
      loadWalletData()
    }
  }, [location.search, loadWalletData])

  // A Paystack return is not proof of payment.
  // Always ask Beevo's backend to verify the reference.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const reference = params.get('reference') || params.get('trxref')

    if (!reference || processedReference.current === reference) return

    processedReference.current = reference
    let active = true

    async function verifyPayment() {
      setNotice('Verifying your payment with Paystack...')
      setError('')

      try {
        const result = await verifyWalletFunding(reference)

        if (!active) return

        setNotice(
          result.alreadyCredited
            ? 'This payment has already been credited to your wallet.'
            : 'Payment verified. Your wallet has been funded successfully.',
        )

        await loadWalletData(1, true)
      } catch (verificationError) {
        if (!active) return

        setError(
          `We could not confirm this payment. ${friendlyError(verificationError)} If you have been charged, please contact support with reference ${reference}.`,
        )
        setNotice('')
      } finally {
        if (active) {
          navigate('/wallet', { replace: true })
        }
      }
    }

    verifyPayment()

    return () => {
      active = false
    }
  }, [location.search, loadWalletData, navigate])

  async function handleFunding(event) {
    event.preventDefault()
    setFundingError('')

    const normalizedAmount = fundingAmount.trim()

    if (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount)) {
      setFundingError('Enter a valid amount with up to two decimal places.')
      return
    }

    const [whole, decimal = ''] = normalizedAmount.split('.')
    const amountKobo = BigInt(whole) * 100n +
      BigInt(decimal.padEnd(2, '0'))

    if (amountKobo <= 0n || amountKobo > 9223372036854775807n) {
      setFundingError('Enter a valid funding amount.')
      return
    }

    setFundingLoading(true)

    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ||
        `beevo-${Date.now()}-${Math.random().toString(36).slice(2)}`

      const checkout = await initializeWalletFunding({
        amountKobo: amountKobo.toString(),
        idempotencyKey,
      })

      if (!checkout.authorizationUrl) {
        throw new Error('Paystack checkout is currently unavailable. Please try again.')
      }

      window.location.assign(checkout.authorizationUrl)
    } catch (requestError) {
      setFundingError(friendlyError(requestError))
      setFundingLoading(false)
    }
  }

  function changePage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages ||
      nextPage === pagination.page
    ) {
      return
    }

    loadWalletData(nextPage, true)
  }

  return (
    <div className="min-w-0 space-y-6 sm:space-y-7">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-inkberry/50">
            Beevo workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold text-inkberry">
            Wallet
          </h1>
          <p className="mt-2 text-sm text-inkberry/60">
            Manage your business credits and funding transactions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadWalletData(pagination.page, true)}
          disabled={loading || refreshing}
          className="rounded-xl border border-inkberry/15 bg-white px-4 py-2.5 text-sm font-semibold text-inkberry transition hover:bg-inkberry/5 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <section className="min-w-0 rounded-2xl border border-inkberry/10 bg-white p-4 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-inkberry/60">
              Available wallet balance
            </p>

            <div className="mt-3">
              {loading && !wallet ? (
                <div className="h-10 w-48 animate-pulse rounded-lg bg-inkberry/10" />
              ) : (
                <p className="break-words text-2xl font-bold tracking-tight text-inkberry sm:text-4xl">
                  {formatNaira(wallet?.balanceKobo)}
                </p>
              )}
            </div>

            <p className="mt-3 text-xs text-inkberry/50">
              {wallet?.currency || 'NGN'} wallet balance
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFundingAmount('')
              setFundingError('')
              setFundingOpen(true)
            }}
            disabled={loading || Boolean(error && !wallet)}
            className="w-full rounded-xl bg-inkberry px-6 py-3 text-sm font-semibold text-white transition hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Fund wallet
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-inkberry/10 bg-white">
        <div className="flex min-w-0 flex-col gap-2 border-b border-inkberry/10 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-inkberry">
              Transaction history
            </h2>
            <p className="mt-1 text-sm text-inkberry/55">
              A record of wallet funding and spending.
            </p>
          </div>

          <p className="text-sm text-inkberry/55">
            {pagination.total} transaction{pagination.total === 1 ? '' : 's'}
          </p>
        </div>

        {loading ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-lg bg-inkberry/5"
              />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="font-semibold text-inkberry">
              No transactions yet
            </h3>
            <p className="mt-2 text-sm text-inkberry/55">
              Your wallet funding and spending history will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[#F7F3EE] text-xs uppercase tracking-wide text-inkberry/55">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Transaction</th>
                    <th className="px-6 py-4 font-semibold">Reference</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 text-right font-semibold">Amount</th>
                    <th className="px-6 py-4 text-right font-semibold">Balance after</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-inkberry/10">
                  {transactions.map((transaction) => {
                    const isCredit = String(transaction.type).toLowerCase() === 'credit'

                    return (
                      <tr key={transaction.id} className="hover:bg-[#F7F3EE]/60">
                        <td className="px-6 py-4">
                          <p className="font-semibold capitalize text-inkberry">
                            {transaction.type || 'Transaction'}
                          </p>
                          <p className="mt-1 max-w-xs truncate text-xs text-inkberry/55">
                            {transaction.description || 'Wallet transaction'}
                          </p>
                        </td>

                        <td className="px-6 py-4 text-xs text-inkberry/60">
                          {transaction.reference || '—'}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-xs text-inkberry/60">
                          {formatDate(transaction.createdAt)}
                        </td>

                        <td className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${isCredit ? 'text-green-700' : 'text-inkberry'}`}>
                          {isCredit ? '+' : '−'}{formatNaira(transaction.amountKobo)}
                        </td>

                        <td className="px-6 py-4 text-right font-medium whitespace-nowrap text-inkberry">
                          {formatNaira(transaction.balanceAfterKobo)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {transactions.map((transaction) => {
                const isCredit = String(transaction.type).toLowerCase() === 'credit'

                return (
                  <article key={transaction.id} className="min-w-0 rounded-xl border border-inkberry/10 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold capitalize text-inkberry">
                          {transaction.type || 'Transaction'}
                        </p>
                        <p className="mt-1 break-words text-xs text-inkberry/55">
                          {transaction.description || 'Wallet transaction'}
                        </p>
                      </div>
                      <p className={`shrink-0 text-right text-sm font-bold ${isCredit ? 'text-green-700' : 'text-inkberry'}`}>
                        {isCredit ? '+' : '−'}{formatNaira(transaction.amountKobo)}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2 border-t border-inkberry/10 pt-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-inkberry/50">Reference</span>
                        <span className="max-w-[65%] break-all text-right text-inkberry/75">
                          {transaction.reference || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-inkberry/50">Date</span>
                        <span className="text-right text-inkberry/75">
                          {formatDate(transaction.createdAt)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-inkberry/50">Balance after</span>
                        <span className="text-right font-semibold text-inkberry">
                          {formatNaira(transaction.balanceAfterKobo)}
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-inkberry/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-inkberry/55">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
              </p>

              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => changePage(pagination.page - 1)}
                  disabled={pagination.page <= 1 || refreshing}
                  className="rounded-lg border border-inkberry/15 px-4 py-2 text-sm font-medium text-inkberry hover:bg-inkberry/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <button
                  type="button"
                  onClick={() => changePage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || refreshing}
                  className="rounded-lg border border-inkberry/15 px-4 py-2 text-sm font-medium text-inkberry hover:bg-inkberry/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {fundingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !fundingLoading) {
              setFundingOpen(false)
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="fund-wallet-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="fund-wallet-title" className="text-xl font-bold text-inkberry">
                  Fund your wallet
                </h2>
                <p className="mt-2 text-sm text-inkberry/60">
                  Enter the amount you want to add to your business wallet.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close dialog"
                disabled={fundingLoading}
                onClick={() => setFundingOpen(false)}
                className="rounded-lg px-2 py-1 text-xl text-inkberry/50 hover:bg-inkberry/5 disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleFunding} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="funding-amount"
                  className="mb-2 block text-sm font-semibold text-inkberry"
                >
                  Amount (NGN)
                </label>

                <div className="flex items-center rounded-xl border border-inkberry/15 px-4 focus-within:border-inkberry">
                  <span className="text-lg font-semibold text-inkberry/60">₦</span>
                  <input
                    id="funding-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    required
                    autoFocus
                    value={fundingAmount}
                    onChange={(event) => setFundingAmount(event.target.value)}
                    placeholder="0.00"
                    disabled={fundingLoading}
                    className="w-full border-0 bg-transparent px-3 py-3 text-lg font-semibold text-inkberry outline-none focus:ring-0"
                  />
                </div>

                <p className="mt-2 text-xs text-inkberry/50">
                  Payments are securely processed through Paystack.
                </p>
              </div>

              {fundingError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {fundingError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={fundingLoading}
                  onClick={() => setFundingOpen(false)}
                  className="rounded-xl border border-inkberry/15 px-5 py-3 text-sm font-semibold text-inkberry hover:bg-inkberry/5 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={fundingLoading || !fundingAmount}
                  className="rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-white hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {fundingLoading ? 'Preparing checkout...' : 'Continue to payment'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default WalletPage
