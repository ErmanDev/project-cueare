import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { Logo } from "../components/Logo";
import { Button, Field } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <div className="login-page">
      <div className="login-atmosphere" aria-hidden="true">
        <div className="login-atmosphere-rays" />
        <img className="login-atmosphere-crest" src="/logo.png" alt="" />
      </div>
      <div className="login-card card">
        <Logo priority />
        <h1>SSC QR Attendance</h1>
        <p className="campus">ACSSCO Bukidnon Campus</p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [obscure, setObscure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return (
      <Navigate
        to={user.role === "superadmin" ? "/superadmin" : "/scanner"}
        replace
      />
    );
  }

  if (!ready) {
    return (
      <LoginFrame>
        <p className="muted login-lead">Checking your session…</p>
      </LoginFrame>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid username or password.");
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(
          "Could not sign in. Check that the server is running, then try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoginFrame>
      <form className="form-grid login-form" onSubmit={onSubmit}>
        {error ? (
          <p className="login-error" id="login-error" role="alert">
            {error}
          </p>
        ) : null}
        <Field label="Username">
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError(null);
            }}
            required
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
        </Field>
        <Field label="Password">
          <div className="login-password">
            <input
              name="password"
              type={obscure ? "password" : "text"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              required
              disabled={busy}
              aria-invalid={error ? true : undefined}
            />
            <button
              type="button"
              className="icon-btn login-password-toggle"
              onClick={() => setObscure((v) => !v)}
              aria-label={obscure ? "Show password" : "Hide password"}
              aria-pressed={!obscure}
              disabled={busy}
            >
              {obscure ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        <Button type="submit" disabled={busy} className="login-submit">
          {busy ? (
            <>
              <LoaderCircle
                size={18}
                className="login-spinner"
                aria-hidden="true"
              />
              Signing in…
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </LoginFrame>
  );
}
