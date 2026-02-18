import { useState, useRef, useEffect, useCallback } from 'react'
import { PolarEmbedCheckout } from '@polar-sh/checkout/embed'
import html2canvas from 'html2canvas'
import './App.css'

type Page = 'home' | 'form' | 'report'

function App() {
  const [page, setPage] = useState<Page>('home')
  const [photo, setPhoto] = useState<string | null>(null)
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [gender, setGender] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [hairstyleImage, setHairstyleImage] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
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

  // Cleanup checkout on unmount
  useEffect(() => {
    return () => {
      if (checkoutRef.current) {
        checkoutRef.current.close()
      }
    }
  }, [])

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
        body: JSON.stringify({ photo, height, weight, gender }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '분석 중 오류가 발생했습니다.')
      }

      setReport(data.report)
      setHairstyleImage(data.hairstyleImage ?? null)
      setPage('report')
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [photo, height, weight, gender])

  const handleSubmit = async () => {
    if (!photo || !height || !weight || !gender) return

    // If already paid, go straight to analysis
    if (paid) {
      runAnalysis()
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Create checkout session
      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embed_origin: window.location.origin,
        }),
      })

      const checkoutData = await checkoutRes.json()

      if (!checkoutRes.ok) {
        throw new Error(checkoutData.error || '결제 세션 생성에 실패했습니다.')
      }

      setLoading(false)

      // 2. Open embedded checkout
      const checkout = await PolarEmbedCheckout.create(checkoutData.url, {
        theme: 'dark',
        onLoaded: () => {
          console.log('Checkout loaded')
        },
      })

      checkoutRef.current = checkout

      // Prevent backdrop click close by setting SDK internal closable to false
      ;(checkout as unknown as { closable: boolean }).closable = false

      // Add custom close button on top of the Polar overlay
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

      // Escape key handler
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && checkoutRef.current) {
          cleanup()
          checkout.close()
        }
      }
      document.addEventListener('keydown', handleEscape)

      // 3. Handle success — start analysis
      checkout.addEventListener('success', (event: Event) => {
        event.preventDefault()
        cleanup()
        setPaid(true)

        // Start analysis immediately after payment
        setLoading(true)
        runAnalysis()
      })

      checkout.addEventListener('close', () => {
        cleanup()
      })
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다.')
    }
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
          title: 'AJY Stylist - My Style Report',
          text: 'AI가 분석한 나만의 스타일 리포트를 확인해보세요!',
          files: [file],
        })
      } else if (navigator.share) {
        await navigator.share({
          title: 'AJY Stylist - My Style Report',
          text: 'AI가 분석한 나만의 스타일 리포트를 확인해보세요!',
          url: window.location.href,
        })
      } else {
        // Fallback: copy URL
        await navigator.clipboard.writeText(window.location.href)
        alert('링크가 클립보드에 복사되었습니다!')
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
    setPage('home')
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
                <strong>포트폴리오 데모 사이트</strong>
                <p>실제 결제가 되지 않습니다. 체험 시 카드번호 <span className="demo-card-number">4242 4242 4242 4242</span>를 입력해 주세요.</p>
              </div>
              <button className="demo-banner-close" onClick={dismissDemoBanner} aria-label="닫기">
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
          <button className="nav-menu-btn">
            <span className="material-icons">menu</span>
          </button>
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
              Find Your <br />
              <span className="italic">Perfect Fit</span> <br />
              with AI.
            </h1>
            <p className="hero-desc">
              AI-powered fashion styling software that generates personalized lookbooks based on your measurements and aesthetic preferences.
            </p>
            <button className="hero-btn" onClick={() => setPage('form')}>
              Get Started
              <span className="material-icons hero-btn-icon">arrow_forward</span>
            </button>
          </div>
        </section>

        {/* How It Works */}
        <section className="how-section">
          <div className="how-header">
            <span className="how-label">The Process</span>
            <h2 className="how-title serif-text">How It Works</h2>
          </div>
          <div className="how-steps">
            <div className="step">
              <div className="step-icon">
                <span className="material-icons">straighten</span>
              </div>
              <div>
                <h3 className="step-title">1. Input Body Data</h3>
                <p className="step-desc">
                  Share your height and weight metrics to help our AI understand your unique silhouette.
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-icon">
                <span className="material-icons">add_a_photo</span>
              </div>
              <div>
                <h3 className="step-title">2. Upload Photo</h3>
                <p className="step-desc">
                  A simple full-body photo allows the AI to analyze your posture and skin undertones.
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-icon">
                <span className="material-icons">auto_awesome</span>
              </div>
              <div>
                <h3 className="step-title">3. Receive AI Curation</h3>
                <p className="step-desc">
                  Our software instantly generates a personalized digital lookbook with fashion recommendations matched to you.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery */}
        <section className="gallery-section">
          <div className="gallery-header">
            <h2 className="gallery-title serif-text">Curated For You</h2>
            <a className="gallery-link" href="#">View Collection</a>
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
            AI Fashion Styling Software. All style reports are automatically generated by AI and are intended as fashion reference material only. This service does not provide human consulting, medical advice, or health guidance.
          </p>
          <div className="footer-links">
            <a href="#terms">Terms of Service</a>
            <span className="footer-divider">|</span>
            <a href="#privacy">Privacy Policy</a>
          </div>
          <p className="footer-copy">&copy; 2026 AJY Stylist. All rights reserved.</p>
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
          <button className="bottom-nav-item">
            <span className="material-icons">person_outline</span>
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
          <div style={{ width: 40 }} />
        </header>

        <div className="page-content">
          <div className="section-label">AI Analysis</div>
          <h2 className="page-title serif-text">Style Report</h2>

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
                  <h2 className="hairstyle-title">추천 헤어스타일</h2>
                  <img
                    className="hairstyle-image"
                    src={hairstyleImage}
                    alt="추천 헤어스타일"
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
              <span>{saving ? '저장 중...' : '이미지 저장'}</span>
            </button>
            <button className="toolbar-btn" onClick={handleShare} disabled={sharing}>
              <span className="material-icons">{sharing ? 'hourglass_empty' : 'share'}</span>
              <span>{sharing ? '공유 중...' : '공유하기'}</span>
            </button>
          </div>

          <div className="ai-disclaimer">
            <span className="material-icons disclaimer-icon">info</span>
            <p>본 보고서는 AI 소프트웨어가 자동 생성한 패션 참고 자료입니다. 전문 스타일리스트의 조언을 대체하지 않으며, 건강 또는 의학적 조언을 포함하지 않습니다.</p>
          </div>

          <div className="report-actions">
            <button className="btn-primary" onClick={handleReset}>
              다시 분석하기
            </button>
            <button className="btn-secondary" onClick={handleGoHome}>
              홈으로 돌아가기
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
        <div style={{ width: 40 }} />
      </header>

      <div className="page-content">
        <div className="section-label">New Analysis</div>
        <h2 className="page-title serif-text">Your Details</h2>

        <div className="form-card">
          {/* Photo Upload */}
          <div className="photo-upload">
            <div
              className={`photo-area ${photo ? 'has-photo' : ''}`}
              onClick={handlePhotoClick}
            >
              {photo ? (
                <img src={photo} alt="프로필 사진" />
              ) : (
                <>
                  <span className="material-icons photo-icon-md">add_a_photo</span>
                  <span className="photo-text">사진 추가</span>
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
            <span className="photo-label">본인 전신 사진을 올려주세요</span>
          </div>

          {/* Gender */}
          <div className="form-group">
            <label className="form-label">성별</label>
            <div className="gender-group">
              <button
                className={`gender-btn ${gender === '남성' ? 'active' : ''}`}
                onClick={() => setGender('남성')}
              >
                남성
              </button>
              <button
                className={`gender-btn ${gender === '여성' ? 'active' : ''}`}
                onClick={() => setGender('여성')}
              >
                여성
              </button>
            </div>
          </div>

          {/* Height */}
          <div className="form-group">
            <label className="form-label">키</label>
            <div className="input-wrapper">
              <input
                type="number"
                className="form-input"
                placeholder="예: 175"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
              <span className="input-unit">cm</span>
            </div>
          </div>

          {/* Weight */}
          <div className="form-group">
            <label className="form-label">몸무게</label>
            <div className="input-wrapper">
              <input
                type="number"
                className="form-input"
                placeholder="예: 68"
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
                {paid ? 'AI가 분석 중입니다...' : '결제 준비 중...'}
              </span>
            ) : (
              <>
                <span className="material-icons btn-icon">lock</span>
                결제 후 스타일 분석 받기
              </>
            )}
          </button>

          <p className="payment-note">
            <span className="material-icons payment-note-icon">verified</span>
            안전한 결제 · Polar를 통한 보안 처리
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
