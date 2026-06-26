'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { login, type LoginState } from './actions'
import '@/styles/auth.css'

function CheckIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button className={`auth-form__submit${pending ? ' auth-form__submit--loading' : ''}`} disabled={pending} type="submit">
      <span className="auth-form__submit-text">Sign in</span>
      <span className="auth-form__submit-loader">
        <span className="auth-spinner" />
        Signing in…
      </span>
      <span className="auth-form__submit-success">
        <CheckIcon />
        Signed in
      </span>
    </button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {})
  const [showPassword, setShowPassword] = useState(false)
  const authError = state.error ?? null

  useEffect(() => {
    document.title = 'Sign in to ATLAS'
  }, [])

  return (
    <div className="auth-shell">
      {/* Left panel — brand */}
      <div className="auth-panel">
        <img className="auth-panel__map" src="/assets/indonesia-map.png" alt="" aria-hidden="true" />
        <div className="auth-panel__inner">
          <div className="auth-panel__brand">
            <div className="auth-panel__mark">
              <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
                <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
                <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
              </svg>
            </div>
            <strong className="auth-panel__wordmark">ATLAS</strong>
          </div>
          <div className="auth-panel__content">
            <p className="auth-panel__eyebrow">Advanced Transformation &amp; Leadership Alignment System</p>
            <h2 className="auth-panel__headline">Programs, execution, and alignment — one platform, one view.</h2>
            <p className="auth-panel__desc">
              ATLAS brings priority programs, cross-functional collaboration, and strategic alignment into a single platform that&apos;s easy to monitor and comfortable to use every day.
            </p>
          </div>
          <div className="auth-panel__org">
            <div><strong>PTPN III (Persero)</strong></div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="auth-form-side">
        <img className="auth-form-side__map" src="/assets/indonesia-map.png" alt="" aria-hidden="true" />
        <div className="auth-form-container">
          <div className="auth-mobile-brand" aria-hidden="true">
            <div className="auth-panel__mark">
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
                <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
                <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
              </svg>
            </div>
            <div className="auth-mobile-brand__copy">
              <strong className="auth-panel__wordmark">ATLAS</strong>
              <span>Advanced Transformation &amp; Leadership Alignment System</span>
            </div>
          </div>

          <div className="auth-form-header">
            <span className="auth-form-header__eyebrow">Sign in to ATLAS Workspace</span>
            <p>Sign in with your NIK or User ID to open today&apos;s workspace.</p>
          </div>

          {authError && (
            <div className="auth-notice auth-notice--error" key={authError}>
              {authError}
            </div>
          )}

          <form className="auth-form" action={formAction}>
            <div className="auth-float-group">
              <input id="identifier" name="identifier" className="auth-float-input" autoComplete="username" placeholder=" " type="text" />
              <label htmlFor="identifier" className="auth-float-label">NIK or User ID</label>
            </div>

            <div className="auth-float-group">
              <input id="password" name="password" className="auth-float-input" autoComplete="current-password" placeholder=" " type={showPassword ? 'text' : 'password'} />
              <label htmlFor="password" className="auth-float-label">Password</label>
              <button className="auth-input-toggle" onClick={() => setShowPassword((v) => !v)} type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            <SubmitButton />
          </form>

          <p className="auth-legal">© 2026 PTPN III (Persero)</p>
        </div>
      </div>
    </div>
  )
}
