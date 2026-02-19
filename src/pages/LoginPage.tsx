import { useState } from 'react'

interface LoginPageProps {
  t: Record<string, string>
  langToggle: React.ReactNode
  onLogin: (email: string, password: string) => Promise<{ error: Error | null }>
  onGoogleLogin: () => Promise<{ error: Error | null }>
  onKakaoLogin: () => Promise<{ error: Error | null }>
  onGoToSignup: () => void
  onGoBack: () => void
  showAuthRequired: boolean
  onSaveFormBeforeOAuth: () => void
  onResetPassword: (email: string) => Promise<{ error: Error | null }>
}

export default function LoginPage({
  t,
  langToggle,
  onLogin,
  onGoogleLogin,
  onKakaoLogin,
  onGoToSignup,
  onGoBack,
  showAuthRequired,
  onSaveFormBeforeOAuth,
  onResetPassword,
}: LoginPageProps) {
  const [view, setView] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.includes('@')) {
      setError(t.errorInvalidEmail)
      return
    }
    if (password.length < 6) {
      setError(t.errorPasswordTooShort)
      return
    }

    setSubmitting(true)
    const { error } = await onLogin(email, password)
    setSubmitting(false)

    if (error) {
      setError(error.message || t.errorAuthGeneric)
    }
  }

  const handleOAuth = async (provider: 'google' | 'kakao') => {
    onSaveFormBeforeOAuth()
    const fn = provider === 'google' ? onGoogleLogin : onKakaoLogin
    const { error } = await fn()
    if (error) {
      setError(error.message || t.errorAuthGeneric)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.includes('@')) {
      setError(t.errorInvalidEmail)
      return
    }

    setSubmitting(true)
    const { error } = await onResetPassword(email)
    setSubmitting(false)

    if (error) {
      setError(error.message || t.errorAuthGeneric)
    } else {
      setResetSent(true)
    }
  }

  const switchToForgot = () => {
    setView('forgot')
    setError(null)
    setResetSent(false)
  }

  const switchToLogin = () => {
    setView('login')
    setError(null)
    setResetSent(false)
  }

  return (
    <div className="app-shell">
      <header className="nav-header glass-nav">
        <button className="nav-back-btn" onClick={view === 'forgot' ? switchToLogin : onGoBack}>
          <span className="material-icons">arrow_back</span>
        </button>
        <div className="nav-logo">
          AJY <span className="nav-logo-sub">Stylist</span>
        </div>
        {langToggle}
      </header>

      <div className="page-content">
        <div className="section-label">{t.authLabel}</div>

        {/* ─── 로그인 뷰 ─── */}
        {view === 'login' && (
          <>
            <h2 className="page-title serif-text">{t.loginTitle}</h2>

            {showAuthRequired && (
              <div className="auth-info">
                <span className="material-icons">info</span>
                <p>{t.authRequired}</p>
              </div>
            )}

            <div className="form-card">
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">{t.emailLabel}</label>
                  <input
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="form-group">
                  <div className="forgot-pw-label-row">
                    <label className="form-label">{t.passwordLabel}</label>
                    <button
                      type="button"
                      className="forgot-pw-link"
                      onClick={switchToForgot}
                    >
                      {t.forgotPassword}
                    </button>
                  </div>
                  <input
                    type="password"
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                {error && <div className="error-message">{error}</div>}

                <button className="btn-primary" type="submit" disabled={submitting}>
                  {submitting ? (
                    <span className="loading-wrapper">
                      <span className="spinner" />
                      {t.loginSubmitting}
                    </span>
                  ) : (
                    t.loginBtn
                  )}
                </button>
              </form>

              <div className="auth-divider">
                <span>{t.orDivider}</span>
              </div>

              <button className="btn-oauth btn-google" onClick={() => handleOAuth('google')}>
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                {t.googleBtn}
              </button>

              <button className="btn-oauth btn-kakao" onClick={() => handleOAuth('kakao')}>
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#3C1E1E" d="M24 4C12.95 4 4 11.16 4 20c0 5.6 3.68 10.5 9.2 13.38l-1.88 6.88c-.14.5.44.91.88.62l8.04-5.36c1.22.16 2.48.24 3.76.24 11.05 0 20-7.16 20-16S35.05 4 24 4z"/></svg>
                {t.kakaoBtn}
              </button>

              <div className="auth-footer">
                <span>{t.noAccount}</span>{' '}
                <button className="auth-footer-link" onClick={onGoToSignup}>
                  {t.signupLink}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── 비밀번호 찾기 뷰 ─── */}
        {view === 'forgot' && (
          <>
            <h2 className="page-title serif-text">{t.forgotPasswordTitle}</h2>

            <div className="form-card">
              {resetSent ? (
                <div className="auth-success">
                  <span className="material-icons">mark_email_read</span>
                  <p>{t.forgotPasswordSent}</p>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit}>
                  <p className="forgot-pw-desc">{t.forgotPasswordDesc}</p>

                  <div className="form-group">
                    <label className="form-label">{t.emailLabel}</label>
                    <input
                      type="email"
                      className="form-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  {error && <div className="error-message">{error}</div>}

                  <button className="btn-primary" type="submit" disabled={submitting}>
                    {submitting ? (
                      <span className="loading-wrapper">
                        <span className="spinner" />
                        {t.forgotPasswordSending}
                      </span>
                    ) : (
                      <>
                        <span className="material-icons btn-icon">send</span>
                        {t.forgotPasswordBtn}
                      </>
                    )}
                  </button>
                </form>
              )}

              <div className="auth-footer">
                <button className="auth-footer-link" onClick={switchToLogin}>
                  {t.backToLogin}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
