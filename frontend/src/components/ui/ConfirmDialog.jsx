export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-inkberry/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-md rounded-2xl border border-inkberry/10 bg-warm-ivory p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-inkberry">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="mt-3 text-sm leading-6 text-inkberry/65">
          {message}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-xl border border-inkberry/15 px-5 py-3 text-sm font-semibold text-inkberry disabled:opacity-50"
          >
            Keep it
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="rounded-xl bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
