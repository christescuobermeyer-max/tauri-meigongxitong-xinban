import { useEffect, useRef, useState, type FormEvent } from "react";
import { signInWithEmail } from "../lib/auth";
import {
  canAutoLogin,
  consumeSkipAutoLoginOnce,
  loadLoginPreferences,
  saveLoginPreferences,
} from "../lib/login-preferences";
import type { ProfileRow } from "../lib/supabase";

interface Props {
  onSuccess: (profile: ProfileRow) => void;
}

const PARTICLES = Array.from({ length: 12 }, (_, index) => index);

export default function LoginPage({ onSuccess }: Props) {
  const autoLoginTried = useRef(false);
  const initialPreferences = loadLoginPreferences();
  const [email, setEmail] = useState(initialPreferences.email);
  const [password, setPassword] = useState(initialPreferences.password);
  const [rememberPassword, setRememberPassword] = useState(initialPreferences.rememberPassword);
  const [autoLogin, setAutoLogin] = useState(initialPreferences.autoLogin);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitLogin(nextEmail: string, nextPassword: string, silent = false) {
    const result = await signInWithEmail(nextEmail, nextPassword);
    saveLoginPreferences({
      email: nextEmail,
      password: nextPassword,
      rememberPassword,
      autoLogin,
    });
    if (!silent) setError(null);
    onSuccess(result.profile);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("请输入邮箱和密码");
      return;
    }

    setSubmitting(true);
    try {
      await submitLogin(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (autoLoginTried.current) return;
    autoLoginTried.current = true;

    if (consumeSkipAutoLoginOnce()) return;
    const preferences = loadLoginPreferences();
    if (!canAutoLogin(preferences)) return;

    setSubmitting(true);
    setError(null);
    void submitLogin(preferences.email, preferences.password, true)
      .catch((err: unknown) => {
        setError(`自动登录失败：${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        setSubmitting(false);
      });
  }, [onSuccess, rememberPassword, autoLogin]);

  return (
    <div className="login-shell">
      <div className="login-shell__backdrop" aria-hidden="true">
        <div className="login-shell__glow login-shell__glow--primary" />
        <div className="login-shell__glow login-shell__glow--secondary" />
        <div className="login-shell__mesh" />
      </div>

      <div className="login-particles" aria-hidden="true">
        {PARTICLES.map((particle) => (
          <span key={particle} className="login-particle" />
        ))}
      </div>

      <div className="login-card">
        <div className="login-card__brand">
          <span className="login-card__logo" aria-hidden="true">
            <img src="/brand-logo.png" alt="" />
          </span>
          <span className="login-card__title">呈尚策划 · 美工生图系统</span>
          <span className="login-card__subtitle">登录以进入工作台</span>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label">邮箱</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field__label">密码</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="login-options">
            <label className="login-option">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRememberPassword(checked);
                  if (!checked) setAutoLogin(false);
                }}
              />
              <span>记住密码</span>
            </label>
            <label className="login-option">
              <input
                type="checkbox"
                checked={autoLogin}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAutoLogin(checked);
                  if (checked) setRememberPassword(true);
                }}
              />
              <span>自动登录</span>
            </label>
          </div>

          {error && <div className="login-card__error">{error}</div>}

          <button
            className="btn btn--primary btn--block btn--lg"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "登录中…" : "登录"}
          </button>

          <div className="login-card__hint">呈尚策划运营部</div>
        </form>
      </div>
    </div>
  );
}
