import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { translateAuthError } from '../lib/authError'

interface ResetPasswordPageProps {
  t: Record<string, string>
  langToggle: React.ReactNode
  onDone: () => void
  onClearRecovery: () => void
}

export default function ResetPasswordPage({
  t,
  langToggle,
  onDone,
  onClearRecovery,
}: ResetPasswordPageProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError(t.errorPasswordTooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t.errorPasswordMismatch)
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSubmitting(false)

    if (error) {
      setError(translateAuthError(error.message, t))
    } else {
      setSuccess(true)
      onClearRecovery()
      setTimeout(() => onDone(), 2500)
    }
  }

  return (
    <div className="app-shell">
      <header className="nav-header glass-nav">
        <div className="nav-logo">
          AJY <span className="nav-logo-sub">Stylist</span>
        </div>
        {langToggle}
      </header>

      <div className="page-content">
        <div className="section-label">{t.authLabel}</div>
        <h2 className="page-title serif-text">{t.resetPasswordTitle}</h2>

        <div className="form-card">
          {success ? (
            <div className="auth-success">
              <span className="material-icons">check_circle</span>
              <p>{t.resetPasswordSuccess}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="forgot-pw-desc">{t.resetPasswordDesc}</p>

              <div className="form-group">
                <label className="form-label">{t.myPageNewPassword}</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t.myPageConfirmPassword}</label>
                <input
                  type="password"
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button className="btn-primary" type="submit" disabled={submitting}>
                {submitting ? (
                  <span className="loading-wrapper">
                    <span className="spinner" />
                    {t.myPageSavingPassword}
                  </span>
                ) : (
                  <>
                    <span className="material-icons btn-icon">lock_reset</span>
                    {t.resetPasswordBtn}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
