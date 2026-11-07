import { useState } from 'react';
import { supabase } from './supabaseClient';
import './Login.css';

const STEPS = [
  { n: 1, text: 'Log in to your account' },
  { n: 2, text: 'Check live driver attendance' },
  { n: 3, text: 'Monitor taxi revenue' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="lg-page">
      <div className="lg-card">
        {/* ---------- Left: gradient hero ---------- */}
        <section className="lg-hero" aria-hidden="false">
          <div className="lg-brand">
            <span className="lg-brand-mark" aria-hidden="true">N</span>
            <span>nemintsco</span>
          </div>

          <div className="lg-hero-body">
            <span className="lg-chip">Nemintsco Depot 🚕</span>
            <h2>Welcome back to the road</h2>
            <p>Follow these simple steps to get into your dashboard.</p>

            <ol className="lg-steps">
              {STEPS.map((s) => (
                <li key={s.n} className={s.n === 1 ? 'active' : ''}>
                  <span className="lg-step-num">{s.n}</span>
                  <span className="lg-step-text">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Right: form ---------- */}
        <section className="lg-form-wrap">
          <form className="lg-form" onSubmit={handleLogin}>
            <h1>Log In</h1>
            <p className="lg-sub">OS Performance System</p>

            {error && <div className="lg-error" role="alert">{error}</div>}

            <div className="lg-field">
              <label htmlFor="lg-email">Email</label>
              <input
                id="lg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nemintsco.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="lg-field">
              <label htmlFor="lg-password">Password</label>
              <div className="lg-input-wrap">
                <input
                  id="lg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="lg-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.9 17.9A10.6 10.6 0 0 1 12 19c-6.4 0-10-7-10-7a18 18 0 0 1 4.1-5.1M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2" />
                      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
                      <path d="M2 2l20 20" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="lg-btn">
              {loading ? 'Logging in…' : 'Continue'}
            </button>

            <p className="lg-legal">
              Authorized Nemintsco staff only. Contact your administrator if you
              need access or can&apos;t sign in.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}