import { useState, type FormEvent } from "react";
import { KeyRound, LogIn, UserPlus } from "lucide-react";
import {
  AUTH_COPY,
  logIn,
  resetPassword,
  signUp,
  type AccountInfo,
} from "../../lib/account";
import type { SyncRequest } from "../../lib/server-sync";
import { Brand, Card, Field } from "../UI";
import "./AuthScreen.css";

type View = "login" | "signup" | "reset";
const VIEWS: { id: View; label: string; icon: typeof LogIn }[] = [
  { id: "login", label: AUTH_COPY.login, icon: LogIn },
  { id: "signup", label: AUTH_COPY.signup, icon: UserPlus },
  { id: "reset", label: AUTH_COPY.forgot, icon: KeyRound },
];

/**
 * Entrada do WebFit online: entrar, criar conta com convite ou trocar a senha com o código de
 * redefinição. A sessão fica no cookie do navegador; `onSignedIn` decide o que fazer com os dados.
 */
export function AuthScreen({
  request,
  onSignedIn,
  notice,
}: {
  request: SyncRequest;
  onSignedIn: (account: AccountInfo) => Promise<void>;
  /** Aviso ao abrir (ex.: a sessão terminou). */
  notice?: string;
}) {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(notice ?? "");

  const choose = (next: View) => {
    setView(next);
    setError("");
    setInfo("");
    setPassword("");
    setCode("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (view === "reset") {
        await resetPassword(request, code, password);
        choose("login");
        setInfo(AUTH_COPY.resetDone);
        return;
      }
      const result =
        view === "login"
          ? await logIn(request, email, password)
          : await signUp(request, { invite: code, email, password, name });
      await onSignedIn(result.account);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Não foi possível concluir agora.");
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = view === "login" ? AUTH_COPY.login : view === "signup" ? AUTH_COPY.signup : "Trocar a senha";
  return (
    <main className="auth-screen">
      <Brand />
      <header className="auth-intro">
        <h1>{AUTH_COPY.title}</h1>
        <p>{AUTH_COPY.subtitle}</p>
      </header>
      <Card className="auth-card">
        <div className="auth-views" role="group" aria-label="Como você quer entrar">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="auth-view"
              aria-pressed={view === id}
              onClick={() => choose(id)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
          {view !== "login" && (
            <Field
              label={view === "signup" ? AUTH_COPY.invite : AUTH_COPY.resetCode}
              hint={view === "signup" ? AUTH_COPY.inviteHint : AUTH_COPY.resetHint}
            >
              <input
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                required
              />
            </Field>
          )}
          {view === "signup" && (
            <Field label={AUTH_COPY.name}>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
            </Field>
          )}
          {view !== "reset" && (
            <Field label={AUTH_COPY.email}>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                required
              />
            </Field>
          )}
          <Field
            label={view === "reset" ? AUTH_COPY.newPassword : AUTH_COPY.password}
            hint={view === "login" ? undefined : AUTH_COPY.passwordHint}
          >
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={view === "login" ? "current-password" : "new-password"}
              minLength={view === "login" ? undefined : 8}
              required
            />
          </Field>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="auth-info" role="status">
              {info}
            </p>
          )}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Aguarde…" : submitLabel}
          </button>
        </form>
      </Card>
      <p className="auth-privacy">
        Seus dados de saúde ficam no aparelho e na sua conta deste servidor. A IA só recebe seu contexto
        quando você autoriza e pede uma resposta.
      </p>
    </main>
  );
}
