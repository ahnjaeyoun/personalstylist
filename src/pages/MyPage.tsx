import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface MyPageProps {
  t: Record<string, string>
  langToggle: React.ReactNode
  user: User
  onGoBack: () => void
  onSignOut: () => void
}

export default function MyPage({ t, langToggle, user, onGoBack, onSignOut }: MyPageProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const provider = (user.app_metadata?.provider ?? 'email') as string
  const isEmailUser = provider === 'email'

  const providerLabel =
    provider === 'google'
      ? t.myPageProviderGoogle
      : provider === 'kakao'
        ? t.myPageProviderKakao
        : t.myPageProviderEmail

  const joinedDate = new Date(user.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const emailInitial = user.email?.[0]?.toUpperCase() ?? '?'

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)

    if (newPassword.length < 8) {
      setPwError(t.errorPasswordTooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError(t.errorPasswordMismatch)
      return
    }

    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwLoading(false)

    if (error) {
      setPwError(error.message)
    } else {
      setPwSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    setDeleteError(null)

    const { error } = await supabase.rpc('delete_user')

    setDeleteLoading(false)

    if (error) {
      setDeleteError(t.myPageDeleteError)
    } else {
      onSignOut()
    }
  }

  return (
    <div className="app-shell">
      <header className="nav-header glass-nav">
        <button className="nav-back-btn" onClick={onGoBack}>
          <span className="material-icons">arrow_back</span>
        </button>
        <div className="nav-logo">
          AJY <span className="nav-logo-sub">Stylist</span>
        </div>
        {langToggle}
      </header>

      <div className="page-content">
        <div className="section-label">{t.myPageLabel}</div>
        <h2 className="page-title serif-text">{t.myPageTitle}</h2>

        {/* ─── 내 정보 ─── */}
        <div className="mypage-avatar-row">
          <div className="mypage-avatar">{emailInitial}</div>
          <div className="mypage-avatar-info">
            <p className="mypage-email">{user.email}</p>
            <p className="mypage-provider-badge">
              <span className="material-icons mypage-provider-icon">
                {provider === 'google' ? 'g_mobiledata' : provider === 'kakao' ? 'chat_bubble' : 'email'}
              </span>
              {providerLabel}
            </p>
          </div>
        </div>

        <div className="form-card">
          <div className="mypage-info-row">
            <span className="mypage-info-label">{t.myPageEmail}</span>
            <span className="mypage-info-value">{user.email}</span>
          </div>
          <div className="mypage-info-divider" />
          <div className="mypage-info-row">
            <span className="mypage-info-label">{t.myPageProvider}</span>
            <span className="mypage-info-value">{providerLabel}</span>
          </div>
          <div className="mypage-info-divider" />
          <div className="mypage-info-row">
            <span className="mypage-info-label">{t.myPageJoined}</span>
            <span className="mypage-info-value">{joinedDate}</span>
          </div>
        </div>

        {/* ─── 비밀번호 변경 ─── */}
        <div className="mypage-section-title">
          <span className="material-icons mypage-section-icon">lock</span>
          {t.myPagePasswordSection}
        </div>

        {isEmailUser ? (
          <div className="form-card">
            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label className="form-label">{t.myPageNewPassword}</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
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

              {pwError && <div className="error-message">{pwError}</div>}
              {pwSuccess && (
                <div className="mypage-success-message">
                  <span className="material-icons">check_circle</span>
                  {t.myPagePasswordSuccess}
                </div>
              )}

              <button className="btn-primary" type="submit" disabled={pwLoading}>
                {pwLoading ? (
                  <span className="loading-wrapper">
                    <span className="spinner" />
                    {t.myPageSavingPassword}
                  </span>
                ) : (
                  t.myPageSavePassword
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="form-card">
            <div className="mypage-oauth-note">
              <span className="material-icons">info</span>
              <p>{t.myPageOAuthPasswordNote}</p>
            </div>
          </div>
        )}

        {/* ─── 계정 탈퇴 ─── */}
        <div className="mypage-section-title mypage-section-danger">
          <span className="material-icons mypage-section-icon">warning</span>
          {t.myPageDangerZone}
        </div>

        <div className="form-card mypage-danger-card">
          <p className="mypage-danger-desc">{t.myPageDeleteAccountDesc}</p>
          <button
            className="btn-danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <span className="material-icons btn-icon">person_remove</span>
            {t.myPageDeleteAccount}
          </button>
        </div>

        {/* Logout */}
        <button className="btn-secondary mypage-logout-btn" onClick={onSignOut}>
          <span className="material-icons btn-icon">logout</span>
          {t.logoutBtn}
        </button>
      </div>

      {/* ─── 탈퇴 확인 모달 ─── */}
      {showDeleteConfirm && (
        <div className="mypage-modal-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="mypage-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mypage-modal-icon">
              <span className="material-icons">warning</span>
            </div>
            <h3 className="mypage-modal-title">{t.myPageDeleteConfirmTitle}</h3>
            <p className="mypage-modal-text">{t.myPageDeleteConfirmText}</p>

            {deleteError && <div className="error-message">{deleteError}</div>}

            <button
              className="btn-danger"
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <span className="loading-wrapper">
                  <span className="spinner" />
                  {t.myPageDeletingAccount}
                </span>
              ) : (
                t.myPageDeleteConfirmBtn
              )}
            </button>
            <button
              className="btn-secondary"
              onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
              disabled={deleteLoading}
            >
              {t.myPageDeleteCancel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
