import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext.jsx'

export default function LoginPage() {
  const { login, googleLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const successMessage = location.state?.message

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
    setError('')
  }

  async function handleGoogleSuccess(response) {
    setError('')

    if (!response?.credential) {
      setError('Google sign-in could not be completed. Please try again.')
      return
    }

    setLoading(true)

    try {
      await googleLogin(response.credential)
      const destination = location.state?.from?.pathname || '/'
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!form.email.trim() || !form.password) {
      setError('Please enter your email address and password.')
      return
    }

    setLoading(true)

    try {
      await login({
        email: form.email.trim(),
        password: form.password,
      })

      const destination = location.state?.from?.pathname || '/'
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err.message || 'We could not sign you in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-warm-ivory px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight text-inkberry">
          beevo<span className="text-inkberry/50">.</span>
        </Link>

        <section className="mt-8 rounded-3xl border border-inkberry/10 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[1.8px] text-inkberry/45">
            Welcome back
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-inkberry">
            Sign in to Beevo
          </h1>

          <p className="mt-2 text-sm leading-6 text-inkberry/60">
            Your business relationships are waiting for you.
          </p>

          {successMessage && (
            <div role="status" className="mt-6 rounded-xl bg-peach-sand/70 px-4 py-3 text-sm text-inkberry">
              {successMessage}
            </div>
          )}

          {error && (
            <div role="alert" className="mt-6 rounded-lg border border-inkberry/20 bg-warm-ivory px-4 py-3 text-sm text-inkberry">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-inkberry">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={updateField}
                placeholder="you@business.com"
                className="w-full rounded-lg border border-inkberry/20 bg-white px-4 py-3.5 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60 "
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold text-inkberry">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs font-semibold text-inkberry/65 underline underline-offset-4 hover:text-inkberry">
                  Forgot password?
                </Link>
              </div>

              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={updateField}
                  placeholder="Enter your password"
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-inkberry px-5 py-3.5 text-sm font-semibold text-warm-ivory transition hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing you in...' : 'Sign in'}
            </button>
          </form>

          {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-inkberry/10" />
                <span className="text-xs text-inkberry/45">OR</span>
                <div className="h-px flex-1 bg-inkberry/10" />
              </div>

              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google sign-in could not be completed. Please try again.')}
                  text="continue_with"
                  shape="rectangular"
                  width="320"
                />
              </div>
            </div>
          )}

          <p className="mt-7 text-center text-sm text-inkberry/60">
            New to Beevo?{' '}
            <Link to="/register" className="font-bold text-inkberry underline underline-offset-4">
              Create an account
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
