import { useState, useRef, useEffect, useCallback } from 'react'
import { PolarEmbedCheckout } from '@polar-sh/checkout/embed'
import html2canvas from 'html2canvas'
import { useLocale } from './i18n'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import MyPage from './pages/MyPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import './App.css'

type Page = 'home' | 'form' | 'report' | 'login' | 'signup' | 'mypage' | 'reset-password'

const FORM_STORAGE_KEY = 'ajy-pending-form'

function App() {
  const { locale, toggleLocale, t } = useLocale()
  const {
    user,
    isLoggedIn,
    loading: authLoading,
    isRecovery,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signInWithKakao,
    signOut,
    resetPasswordForEmail,
    clearRecovery,
  } = useAuth()
  const [page, setPage] = useState<Page>('home')
  const [photo, setPhoto] = useState<string | null>(null)
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [hairstyleImage, setHairstyleImage] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [checkoutId, setCheckoutId] = useState<string | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const [showAuthRequired, setShowAuthRequired] = useState(false)
  const [showDemoBanner, setShowDemoBanner] = useState(() => {
    return !sessionStorage.getItem('demo-banner-dismissed')
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const checkoutRef = useRef<Awaited<ReturnType<typeof PolarEmbedCheckout.create>> | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  const dismissDemoBanner = () => {
    setShowDemoBanner(false)
    sessionStorage.setItem('demo-banner-dismissed', '1')
  }

  // Restore form data from sessionStorage after OAuth redirect
  useEffect(() => {
    const stored = sessionStorage.getItem(FORM_STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.photo) setPhoto(data.photo)
        if (data.height) setHeight(data.height)
        if (data.weight) setWeight(data.weight)
        if (data.gender) setGender(data.gender)
        if (data.pendingSubmit) setPendingSubmit(true)
        setPage('form')
      } catch {
        // ignore
      }
      sessionStorage.removeItem(FORM_STORAGE_KEY)
    }
  }, [])

  // Auto-submit after login when pendingSubmit is true
  useEffect(() => {
    if (isLoggedIn && pendingSubmit && !authLoading) {
      setPendingSubmit(false)
      setShowAuthRequired(false)
      // Small delay to let state settle
      setTimeout(() => {
        handleSubmitAfterAuth()
      }, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, pendingSubmit, authLoading])

  // Cleanup checkout on unmount
  useEffect(() => {
    return () => {
      if (checkoutRef.current) {
        checkoutRef.current.close()
      }
    }
  }, [])

  // Navigate to reset-password page when Supabase PASSWORD_RECOVERY event fires
  useEffect(() => {
    if (isRecovery) {
      setPage('reset-password')
    }
  }, [isRecovery])

  const handlePhotoClick = () => {
    fileInputRef.current?.click()
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPhoto(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const runAnalysis = useCallback(async () => {
    if (!photo || !height || !weight || !gender) return

    setLoading(true)
    setError(null)
    setReport(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo, height, weight, gender, locale, checkout_id: checkoutId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t.errorAnalysis)
      }

      setReport(data.report)
      setHairstyleImage(data.hairstyleImage ?? null)
      setPage('report')
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorUnknown)
    } finally {
      setLoading(false)
    }
  }, [photo, height, weight, gender, locale, t, checkoutId])

  const startCheckoutFlow = useCallback(async () => {
    if (!photo || !height || !weight || !gender) return

    setLoading(true)
    setError(null)
    setPage('form')

    try {
      // 1. Create checkout session
      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embed_origin: window.location.origin,
          locale,
        }),
      })

      const checkoutData = await checkoutRes.json()

      if (!checkoutRes.ok) {
        throw new Error(checkoutData.error || t.errorCheckout)
      }

      setLoading(false)
      if (checkoutData.id) setCheckoutId(checkoutData.id)

      // 2. Open embedded checkout
      const checkout = await PolarEmbedCheckout.create(checkoutData.url, {
        theme: 'dark',
        onLoaded: () => {
          console.log('Checkout loaded')
        },
      })

      checkoutRef.current = checkout

      // Prevent backdrop click close
      ;(checkout as unknown as { closable: boolean }).closable = false

      // Add custom close button
      const closeBtn = document.createElement('button')
      closeBtn.innerHTML = '<span class="material-icons" style="font-size:28px">close</span>'
      closeBtn.setAttribute('aria-label', 'Close checkout')
      Object.assign(closeBtn.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: '2147483647',
        background: 'rgba(255,255,255,0.15)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '50%',
        width: '44px',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        cursor: 'pointer',
        padding: '0',
        transition: 'background 0.2s',
      })
      closeBtn.onmouseenter = () => { closeBtn.style.background = 'rgba(255,255,255,0.25)' }
      closeBtn.onmouseleave = () => { closeBtn.style.background = 'rgba(255,255,255,0.15)' }
      const cleanup = () => {
        closeBtnRef.current?.remove()
        closeBtnRef.current = null
        document.removeEventListener('keydown', handleEscape)
        checkoutRef.current = null
      }
      closeBtn.onclick = () => {
        cleanup()
        checkout.close()
      }
      document.body.appendChild(closeBtn)
      closeBtnRef.current = closeBtn

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && checkoutRef.current) {
          cleanup()
          checkout.close()
        }
      }
      document.addEventListener('keydown', handleEscape)

      // 3. Handle success
      checkout.addEventListener('success', (event: Event) => {
        event.preventDefault()
        cleanup()
        setPaid(true)
        setLoading(true)
        runAnalysis()
      })

      checkout.addEventListener('close', () => {
        cleanup()
      })
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : t.errorPayment)
    }
  }, [photo, height, weight, gender, locale, t, runAnalysis])

  // Called after auth succeeds and pendingSubmit fires
  const handleSubmitAfterAuth = useCallback(() => {
    if (!photo || !height || !weight || !gender) return
    if (paid) {
      runAnalysis()
    } else {
      startCheckoutFlow()
    }
  }, [photo, height, weight, gender, paid, runAnalysis, startCheckoutFlow])

  const handleSubmit = async () => {
    if (!photo || !height || !weight || !gender) return

    // Auth gate: require login before checkout
    if (!isLoggedIn) {
      setPendingSubmit(true)
      setShowAuthRequired(true)
      setPage('login')
      return
    }

    // If already paid, go straight to analysis
    if (paid) {
      runAnalysis()
      return
    }

    startCheckoutFlow()
  }

  // Save form data to sessionStorage before OAuth redirect
  const saveFormBeforeOAuth = () => {
    const data = { photo, height, weight, gender, pendingSubmit: true }
    sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(data))
  }

  const captureReport = async (): Promise<Blob | null> => {
    if (!reportRef.current) return null
    const canvas = await html2canvas(reportRef.current, {
      backgroundColor: '#131022',
      scale: 2,
      useCORS: true,
    })
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  }

  const handleSaveImage = async () => {
    setSaving(true)
    try {
      const blob = await captureReport()
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'aura-style-report.png'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      const blob = await captureReport()
      if (!blob) return

      const file = new File([blob], 'aura-style-report.png', { type: 'image/png' })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: t.shareTitle,
          text: t.shareText,
          files: [file],
        })
      } else if (navigator.share) {
        await navigator.share({
          title: t.shareTitle,
          text: t.shareText,
          url: window.location.href,
        })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        alert(t.clipboardCopied)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err)
      }
    } finally {
      setSharing(false)
    }
  }

  const handleReset = () => {
    setReport(null)
    setHairstyleImage(null)
    setError(null)
    setPaid(false)
    setCheckoutId(null)
    setPage('form')
  }

  const handleGoHome = () => {
    setReport(null)
    setHairstyleImage(null)
    setError(null)
    setPhoto(null)
    setHeight('')
    setWeight('')
    setGender(null)
    setPaid(false)
    setCheckoutId(null)
    setPendingSubmit(false)
    setShowAuthRequired(false)
    setPage('home')
  }

  const handleSignOut = async () => {
    await signOut()
    handleGoHome()
  }

  const isFormValid = photo && height && weight && gender

  const renderMarkdown = (text: string) => {
    const html = text
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/# (.*)/g, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>')
    return `<p>${html}</p>`
  }

  const langToggle = (
    <button className="lang-switcher" onClick={toggleLocale} aria-label="Toggle language">
      {locale === 'ko' ? 'EN' : 'KO'}
    </button>
  )

  const authHeaderBtn = isLoggedIn ? (
    <button className="nav-user-btn" onClick={() => setPage('mypage')} title={user?.email ?? t.myPageTitle}>
      <span className="material-icons">person</span>
    </button>
  ) : (
    <button className="nav-login-btn" onClick={() => setPage('login')}>
      {t.loginBtn}
    </button>
  )

  // ─── RESET PASSWORD ───
  if (page === 'reset-password') {
    return (
      <ResetPasswordPage
        t={t}
        langToggle={langToggle}
        onDone={handleGoHome}
        onClearRecovery={clearRecovery}
      />
    )
  }

  // ─── MYPAGE ───
  if (page === 'mypage' && user) {
    return (
      <MyPage
        t={t}
        langToggle={langToggle}
        user={user}
        onGoBack={() => setPage('home')}
        onSignOut={handleSignOut}
      />
    )
  }

  // ─── LOGIN ───
  if (page === 'login') {
    return (
      <LoginPage
        t={t}
        langToggle={langToggle}
        onLogin={signInWithEmail}
        onGoogleLogin={signInWithGoogle}
        onKakaoLogin={signInWithKakao}
        onGoToSignup={() => setPage('signup')}
        onGoBack={() => setPage(pendingSubmit ? 'form' : 'home')}
        showAuthRequired={showAuthRequired}
        onSaveFormBeforeOAuth={saveFormBeforeOAuth}
        onResetPassword={resetPasswordForEmail}
      />
    )
  }

  // ─── SIGNUP ───
  if (page === 'signup') {
    return (
      <SignupPage
        t={t}
        langToggle={langToggle}
        onSignup={signUpWithEmail}
        onGoogleLogin={signInWithGoogle}
        onKakaoLogin={signInWithKakao}
        onGoToLogin={() => setPage('login')}
        onGoBack={() => setPage(pendingSubmit ? 'form' : 'home')}
        onSaveFormBeforeOAuth={saveFormBeforeOAuth}
      />
    )
  }

  // ─── HOME (Landing) ───
  if (page === 'home') {
    return (
      <div className="app-shell">
        {/* Demo Banner */}
        {showDemoBanner && (
          <div className="demo-banner">
            <div className="demo-banner-content">
              <span className="material-icons demo-banner-icon">info</span>
              <div className="demo-banner-text">
                <strong>{t.demoBannerTitle}</strong>
                <p>{t.demoBannerText} <span className="demo-card-number">4242 4242 4242 4242</span>{t.demoBannerCardSuffix}</p>
              </div>
              <button className="demo-banner-close" onClick={dismissDemoBanner} aria-label={t.demoBannerClose}>
                <span className="material-icons">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="nav-header glass-nav">
          <div className="nav-logo">
            AJY <span className="nav-logo-sub">Stylist</span>
          </div>
          <div className="nav-header-right">
            {authHeaderBtn}
            {langToggle}
          </div>
        </header>

        {/* Hero */}
        <section className="hero">
          <div className="hero-bg">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuA-fiwRa5-tCfjbVjLI5-JQtHfi40eZakC0FUExVdkxxV3nXjAcbDMRmQAWVi9q-2YxJkPMVVja-WV9uU1p6ebDpUpSfZav4BEDbWhhUrLa4ri6HF_pPMlzmwVjJNRtBgF567WHwkKZ41NzbfFoV-VGgzLrgNUF9EKrVlcccUd_CNJBTFXPeDXX8gXpzwxuULDA0EThiDiUgWk0FFkK9qMycHsPiFNR4ZtBvKEn2bb4Y8QMqY4ZWnJMKUI9cLc4A3XQC9WoHae-OZCT"
              alt="High fashion model"
            />
            <div className="hero-overlay" />
          </div>
          <div className="hero-content">
            <h1 className="hero-title serif-text">
              {t.heroTitle1} <br />
              <span className="italic">{t.heroTitle2}</span> <br />
              {t.heroTitle3}
            </h1>
            <p className="hero-desc">
              {t.heroDesc}
            </p>
            <button className="hero-btn" onClick={() => setPage('form')}>
              {t.heroBtn}
              <span className="material-icons hero-btn-icon">arrow_forward</span>
            </button>
          </div>
        </section>

        {/* How It Works */}
        <section className="how-section">
          <div className="how-header">
            <span className="how-label">{t.howLabel}</span>
            <h2 className="how-title serif-text">{t.howTitle}</h2>
          </div>
          <div className="how-steps">
            <div className="step">
              <div className="step-icon">
                <span className="material-icons">straighten</span>
              </div>
              <div>
                <h3 className="step-title">{t.step1Title}</h3>
                <p className="step-desc">
                  {t.step1Desc}
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-icon">
                <span className="material-icons">add_a_photo</span>
              </div>
              <div>
                <h3 className="step-title">{t.step2Title}</h3>
                <p className="step-desc">
                  {t.step2Desc}
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-icon">
                <span className="material-icons">auto_awesome</span>
              </div>
              <div>
                <h3 className="step-title">{t.step3Title}</h3>
                <p className="step-desc">
                  {t.step3Desc}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery */}
        <section className="gallery-section">
          <div className="gallery-header">
            <h2 className="gallery-title serif-text">{t.galleryTitle}</h2>
            <a className="gallery-link" href="#">{t.galleryLink}</a>
          </div>
          <div className="gallery-grid">
            <div className="gallery-col">
              <div className="gallery-item gallery-tall">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAYI7j-EeOyCrvgcZvfnq9qsfYK5kZfteGOM17HwZoeKHZfsAvotEi-YKyr4kAEF-H6AOQ6Scw22oHlR0KqktTmsnp_0jWYq1QLJmDbNW5_QhOh6y4prFivL_XwGcFaFGKnT0Uo7pB_FvF_hNRCWXBJW0UV1tPqP52zGZRiWYhkpu6ee19V1WRux0Zs1SY5EdEeI0mHufL4CpTLGOtUGlOLoUvNriytLvHUmlM8JcvA7MIVA4bSMc9s98pMu_MbzuVfJpC3msM7E0Pc"
                  alt="Minimalist street style"
                />
              </div>
              <div className="gallery-item gallery-short">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuB_OwgVmGf8vN2ie_mIgxpJ3Mm7JGqaBziCCcH3Zq-TIOHUjJoH6vC3GfbLmyeBfInP8iA-N6CtnRGtOMliK_Kj8XVdedVgNkPI-ul6zYhouSJtSr2YK_d3CaBWaZinfmJ50nX37A94Gfn0aW9uAZ1ApO5IzsCSmbQvyK8eU9F4AT9aSRtneq0gW_6FjAoNWz5XI5W5iIoCe-cE-VzwEzW0FHtzRMMVVcBuXjIGgath6UCKrUh2qvQKTtOvv2iE-8OTGhTxLTYZdu3-"
                  alt="Fashion detail"
                />
              </div>
            </div>
            <div className="gallery-col gallery-col-offset">
              <div className="gallery-item gallery-short">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPQdj00w1TIqnwjHIuV5ESdVkOlFIhhpZDp-FGeRHn5zZ8wDsaJruAfK2t2ymDRwzGGQUDGkX3VJhiAAaz4o16qwcSgnfgx8DSCTqMrVfccRt9d6j7MNB-D-gj-xzdtgfBSux3KDXa4df3cR87k4CKC8z5H881WS2ei0sDtEoq46gZ0ClwohxUEVjfIkOC4_2sNnwBFHO_xw70qJGKloXV3GBSWsASyES-0a9S4JBzsMX56pbFiDCD3twM6kTemwO4cUTDgvQ99Kur"
                  alt="Sophisticated evening wear"
                />
              </div>
              <div className="gallery-item gallery-tall">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBx2ZycIOHUoBR79OG3WzOMgCCZxQV-6xNqrY6K4YHHYInk39gxiVYy3ObJvwpGSdqGWJEh4QIyc_p6ZNrA4bjiZRqcOWvqbX_2z7kep62CABj6sJEQrG3AjsTGXpOZK0uMjHuwAkNlx3TacT-tj_a6SDLr4XgR1bxfZvZyrdDEt6ba7uACeWmQpUBTfWe_Tw-cv8iIpKBzDyiQH4WNzuYf6MpO0ToKXrbRswZBuhs22v1b1sL4ADko-MX0IX3jHkLm8-W45CV3z4SV"
                  alt="Modern minimalist aesthetic"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="site-footer">
          <p className="footer-brand serif-text">AJY Stylist</p>
          <p className="footer-desc">
            {t.footerDesc}
          </p>
          <div className="footer-links">
            <a href="#terms">{t.footerTerms}</a>
            <span className="footer-divider">|</span>
            <a href="#privacy">{t.footerPrivacy}</a>
          </div>
          <p className="footer-copy">{t.footerCopy}</p>
        </footer>

        {/* Bottom Nav */}
        <nav className="bottom-nav glass-nav">
          <button className="bottom-nav-item active">
            <span className="material-icons">home</span>
          </button>
          <button className="bottom-nav-item">
            <span className="material-icons">explore</span>
          </button>
          <div className="bottom-nav-center">
            <button className="bottom-nav-fab" onClick={() => setPage('form')}>
              <span className="material-icons">add</span>
            </button>
          </div>
          <button className="bottom-nav-item">
            <span className="material-icons">bookmark_border</span>
          </button>
          <button className="bottom-nav-item" onClick={() => isLoggedIn ? setPage('mypage') : setPage('login')}>
            <span className="material-icons">{isLoggedIn ? 'person' : 'person_outline'}</span>
          </button>
        </nav>
      </div>
    )
  }

  // ─── REPORT ───
  if (page === 'report' && report) {
    return (
      <div className="app-shell">
        <header className="nav-header glass-nav">
          <button className="nav-back-btn" onClick={handleGoHome}>
            <span className="material-icons">arrow_back</span>
          </button>
          <div className="nav-logo">
            AJY <span className="nav-logo-sub">Stylist</span>
          </div>
          <div className="nav-header-right">
            {authHeaderBtn}
            {langToggle}
          </div>
        </header>

        <div className="page-content">
          <div className="section-label">{t.reportLabel}</div>
          <h2 className="page-title serif-text">{t.reportTitle}</h2>

          <div className="report-capture" ref={reportRef}>
            <div className="report-capture-header">
              <span className="report-capture-logo serif-text">AJY <span className="nav-logo-sub">Stylist</span></span>
            </div>
            <div className="report-card">
              <div
                className="report-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}
              />
              {hairstyleImage && (
                <div className="hairstyle-section">
                  <h2 className="hairstyle-title">{t.hairstyleTitle}</h2>
                  <img
                    className="hairstyle-image"
                    src={hairstyleImage}
                    alt={t.hairstyleTitle}
                  />
                </div>
              )}
            </div>
            <div className="report-capture-footer">
              <p>AI Fashion Styling by AJY Stylist</p>
            </div>
          </div>

          <div className="report-toolbar">
            <button className="toolbar-btn" onClick={handleSaveImage} disabled={saving}>
              <span className="material-icons">{saving ? 'hourglass_empty' : 'save_alt'}</span>
              <span>{saving ? t.savingBtn : t.saveBtn}</span>
            </button>
            <button className="toolbar-btn" onClick={handleShare} disabled={sharing}>
              <span className="material-icons">{sharing ? 'hourglass_empty' : 'share'}</span>
              <span>{sharing ? t.sharingBtn : t.shareBtn}</span>
            </button>
          </div>

          <div className="ai-disclaimer">
            <span className="material-icons disclaimer-icon">info</span>
            <p>{t.disclaimer}</p>
          </div>

          <div className="report-actions">
            <button className="btn-primary" onClick={handleReset}>
              {t.retryBtn}
            </button>
            <button className="btn-secondary" onClick={handleGoHome}>
              {t.homeBtn}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── FORM ───
  return (
    <div className="app-shell">
      <header className="nav-header glass-nav">
        <button className="nav-back-btn" onClick={handleGoHome}>
          <span className="material-icons">arrow_back</span>
        </button>
        <div className="nav-logo">
          AJY <span className="nav-logo-sub">Stylist</span>
        </div>
        <div className="nav-header-right">
          {authHeaderBtn}
          {langToggle}
        </div>
      </header>

      <div className="page-content">
        <div className="section-label">{t.formLabel}</div>
        <h2 className="page-title serif-text">{t.formTitle}</h2>

        <div className="form-card">
          {/* Photo Upload */}
          <div className="photo-upload">
            <div
              className={`photo-area ${photo ? 'has-photo' : ''}`}
              onClick={handlePhotoClick}
            >
              {photo ? (
                <img src={photo} alt="Profile photo" />
              ) : (
                <>
                  <span className="material-icons photo-icon-md">add_a_photo</span>
                  <span className="photo-text">{t.photoText}</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
            />
            <span className="photo-label">{t.photoLabel}</span>
          </div>

          {/* Gender */}
          <div className="form-group">
            <label className="form-label">{t.genderLabel}</label>
            <div className="gender-group">
              <button
                className={`gender-btn ${gender === 'male' ? 'active' : ''}`}
                onClick={() => setGender('male')}
              >
                {t.genderMale}
              </button>
              <button
                className={`gender-btn ${gender === 'female' ? 'active' : ''}`}
                onClick={() => setGender('female')}
              >
                {t.genderFemale}
              </button>
            </div>
          </div>

          {/* Height */}
          <div className="form-group">
            <label className="form-label">{t.heightLabel}</label>
            <div className="input-wrapper">
              <input
                type="number"
                className="form-input"
                placeholder={t.heightPlaceholder}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
              <span className="input-unit">cm</span>
            </div>
          </div>

          {/* Weight */}
          <div className="form-group">
            <label className="form-label">{t.weightLabel}</label>
            <div className="input-wrapper">
              <input
                type="number"
                className="form-input"
                placeholder={t.weightPlaceholder}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="input-unit">kg</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            className="btn-primary"
            disabled={!isFormValid || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <span className="loading-wrapper">
                <span className="spinner" />
                {paid ? t.loadingAnalysis : t.loadingCheckout}
              </span>
            ) : (
              <>
                <span className="material-icons btn-icon">lock</span>
                {t.submitBtn}
              </>
            )}
          </button>

          <p className="payment-note">
            <span className="material-icons payment-note-icon">verified</span>
            {t.paymentNote}
          </p>

          <p className="email-policy-note">
            <span className="material-icons email-policy-icon">email</span>
            {t.emailPolicyNote}
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
