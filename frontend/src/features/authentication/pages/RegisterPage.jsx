import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerService } from '../services/auth.service.js'

const initialForm = {
  businessName: '',
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
    setError('')
  }

  function validate() {
    if (form.businessName.trim().length < 2) {
      return 'Please enter your business name (at least 2 characters).'
    }

    if (form.name.trim().length < 2) {
      return 'Please enter your full name (at least 2 characters).'
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Please enter a valid email address.'
    }

    if (form.phone.length > 30) {
      return 'Your phone number is too long.'
    }

    if (form.password.length < 8 || form.password.length > 72) {
      return 'Your password must be between 8 and 72 characters.'
    }

    if (!/[A-Z]/.test(form.password)) {
      return 'Your password needs at least one uppercase letter.'
    }

    if (!/[a-z]/.test(form.password)) {
      return 'Your password needs at least one lowercase letter.'
    }

    if (!/[0-9]/.test(form.password)) {
      return 'Your password needs at least one number.'
    }

    if (!/[^A-Za-z0-9\s]/.test(form.password)) {
      return 'Your password needs at least one special character.'
    }

    if (form.password !== form.confirmPassword) {
      return 'Your passwords do not match.'
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validationError = validate()

    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')

    try {
      await registerService({
        businessName: form.businessName.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      })

      navigate('/login', {
        replace: true,
        state: {
          message: 'Your Beevo account has been created. Please sign in to continue.',
        },
      })
    } catch (err) {
      let message = err.message || 'We could not create your account. Please try again.'

      if (Array.isArray(err.errors) && err.errors.length > 0) {
        message = err.errors[0].message || message
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-warm-ivory px-5 py-12">
      <div className="w-full max-w-lg">
        <Link to="/login" className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight text-inkberry">
          beevo<span className="text-inkberry/50">.</span>
        </Link>

        <section className="mt-8 rounded-3xl border border-inkberry/10 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[1.8px] text-inkberry/45">
            Get started
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-inkberry">
            Create your account
          </h1>

          <p className="mt-2 text-sm leading-6 text-inkberry/60">
            Bring your customers, enquiries and follow-ups together in one workspace.
          </p>

          {error && (
            <div role="alert" className="mt-6 rounded-lg border border-inkberry/20 bg-warm-ivory px-4 py-3 text-sm text-inkberry">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {[
              { name: 'businessName', label: 'Business name', placeholder: 'Your business name', type: 'text', auto: 'organization' },
              { name: 'name', label: 'Your full name', placeholder: 'Enter your full name', type: 'text', auto: 'name' },
              { name: 'email', label: 'Email address', placeholder: 'you@business.com', type: 'email', auto: 'email' },
              { name: 'phone', label: 'Phone number (optional)', placeholder: 'Enter your phone number', type: 'tel', auto: 'tel' },
            ].map((field) => (
              <div key={field.name}>
                <label htmlFor={field.name} className="mb-2 block text-sm font-semibold text-inkberry">
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  autoComplete={field.auto}
                  required={field.name !== 'phone'}
                  value={form[field.name]}
                  onChange={updateField}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-inkberry/20 bg-white px-4 py-3.5 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60 "
                />
              </div>
            ))}

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-inkberry">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={updateField}
                  placeholder="Create a strong password"
                  className="w-full rounded-lg border border-inkberry/20 bg-white px-4 py-3.5 pr-20 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60 "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-inkberry/60"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-inkberry/50">
                8–72 characters, including uppercase, lowercase, a number and a special character.
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-inkberry">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={form.confirmPassword}
                onChange={updateField}
                placeholder="Enter your password again"
                className="w-full rounded-lg border border-inkberry/20 bg-white px-4 py-3.5 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60 "
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-inkberry px-5 py-3.5 text-sm font-semibold text-warm-ivory transition hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating your account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-inkberry/60">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-inkberry underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </section>

        <p className="mt-7 text-center text-xs text-inkberry/45">
          Every enquiry deserves a follow-up.
        </p>
      </div>
    </main>
  )
}
