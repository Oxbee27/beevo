import { useState } from 'react'
import './CookieConsent.css'

const CONSENT_KEY = 'beevo_cookie_consent'
const CONSENT_VERSION = 1

const defaultPreferences = {
  essential: true,
  analytics: false,
  marketing: false,
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    try {
      const saved = localStorage.getItem(CONSENT_KEY)

      if (saved) {
        const consent = JSON.parse(saved)

        if (consent.version === CONSENT_VERSION) {
          return false
        }
      }

      return true
    } catch {
      return true
    }
  })
  const [showSettings, setShowSettings] = useState(false)
  const [preferences, setPreferences] = useState(defaultPreferences)

  function saveConsent(selectedPreferences) {
    const consent = {
      version: CONSENT_VERSION,
      preferences: {
        essential: true,
        analytics: Boolean(selectedPreferences.analytics),
        marketing: Boolean(selectedPreferences.marketing),
      },
      updatedAt: new Date().toISOString(),
    }

    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent))
      setPreferences(consent.preferences)
      setVisible(false)
      setShowSettings(false)
    } catch {
      // Keep the consent notice visible if preferences cannot be saved.
    }
  }

  function acceptAll() {
    saveConsent({
      essential: true,
      analytics: true,
      marketing: true,
    })
  }

  function rejectOptional() {
    saveConsent(defaultPreferences)
  }

  function updatePreference(name, checked) {
    setPreferences((current) => ({
      ...current,
      [name]: checked,
    }))
  }

  if (!visible) return null

  return (
    <div className="beevo-cookie-overlay">
      <section
        className="beevo-cookie-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beevo-cookie-title"
        aria-describedby="beevo-cookie-description"
      >
        <div className="beevo-cookie-heading">
          <span className="beevo-cookie-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M20.2 13A8.5 8.5 0 1 1 11 3.8c.1 2.5 2.2 4.5 4.7 4.5.1 2.5 2 4.5 4.5 4.7Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="8.5" cy="10" r="1" fill="currentColor" />
              <circle cx="12" cy="15.5" r="1" fill="currentColor" />
              <circle cx="7.5" cy="16" r="1" fill="currentColor" />
            </svg>
          </span>

          <div>
            <p className="beevo-cookie-eyebrow">YOUR PRIVACY MATTERS</p>
            <h2 id="beevo-cookie-title">Your cookie preferences</h2>
          </div>
        </div>

        <p id="beevo-cookie-description" className="beevo-cookie-description">
          Beevo uses essential storage to keep the application working and
          remember your preferences. With your permission, we may also use
          optional analytics and marketing technologies.
        </p>

        {!showSettings ? (
          <>
            <div className="beevo-cookie-essential-note">
              <span>Essential storage</span>
              <span className="beevo-cookie-always-on">Always active</span>
            </div>

            <p className="beevo-cookie-small">
              Optional categories remain disabled unless you choose to enable
              them. You can review your preferences before making a choice.
            </p>

            <div className="beevo-cookie-actions">
              <button
                type="button"
                className="beevo-cookie-button beevo-cookie-primary"
                onClick={acceptAll}
              >
                Accept all
              </button>

              <button
                type="button"
                className="beevo-cookie-button beevo-cookie-secondary"
                onClick={rejectOptional}
              >
                Reject optional
              </button>

              <button
                type="button"
                className="beevo-cookie-settings-link"
                onClick={() => setShowSettings(true)}
              >
                Cookie settings
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="beevo-cookie-preferences">
              <div className="beevo-cookie-preference">
                <div>
                  <strong>Essential</strong>
                  <p>Required for security and core application functions.</p>
                </div>
                <input type="checkbox" checked disabled aria-label="Essential storage always active" />
              </div>

              <div className="beevo-cookie-preference">
                <div>
                  <strong>Analytics</strong>
                  <p>Helps us understand how people use Beevo.</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.analytics}
                  onChange={(event) =>
                    updatePreference('analytics', event.target.checked)
                  }
                  aria-label="Allow analytics"
                />
              </div>

              <div className="beevo-cookie-preference">
                <div>
                  <strong>Marketing</strong>
                  <p>Allows optional marketing and advertising technologies.</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.marketing}
                  onChange={(event) =>
                    updatePreference('marketing', event.target.checked)
                  }
                  aria-label="Allow marketing"
                />
              </div>
            </div>

            <div className="beevo-cookie-actions">
              <button
                type="button"
                className="beevo-cookie-button beevo-cookie-primary"
                onClick={() => saveConsent(preferences)}
              >
                Save my choices
              </button>

              <button
                type="button"
                className="beevo-cookie-button beevo-cookie-secondary"
                onClick={rejectOptional}
              >
                Reject optional
              </button>

              <button
                type="button"
                className="beevo-cookie-settings-link"
                onClick={() => setShowSettings(false)}
              >
                Back
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
