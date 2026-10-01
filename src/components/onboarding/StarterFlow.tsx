import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarCheck,
  ChevronLeft,
  Dumbbell,
  HeartPulse,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Sprout,
} from "lucide-react";
import { HABIT_SUGGESTIONS } from "../../data/habit-suggestions";
import { STARTER_GOALS } from "../../lib/starter";
import { LogoMark } from "../Logo";
import { RestoreBackup } from "../RestoreBackup";
import { Field } from "../UI";

const GOAL_ICONS = {
  perder: Sprout,
  organizar: CalendarCheck,
  manter: HeartPulse,
  ganhar: Dumbbell,
} as const;

const VALUES = [
  { icon: ListChecks, text: "Água, refeições e combinados em poucos toques." },
  { icon: Sparkles, text: "Um agente que usa sua rotina, só quando você autorizar." },
  { icon: ShieldCheck, text: "Seus dados ficam neste navegador, sem conta." },
] as const;

const SCREENS = ["Boas-vindas", "Sobre você", "Primeiro passo"] as const;

type Props = {
  name: string;
  onName: (name: string) => void;
  goal: string;
  onGoal: (goal: string) => void;
  consent: boolean;
  onConsent: (consent: boolean) => void;
  habitIndex: number | null;
  onHabit: (index: number | null) => void;
  error: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPersonalize: () => void;
};

/** Ilustração leve (SVG próprio, sem imagem externa): prato, gota d'água e um check. */
function WelcomeArt() {
  return (
    <svg className="starter-art" viewBox="0 0 200 140" aria-hidden="true">
      <circle cx="100" cy="72" r="62" fill="var(--wf-mint-50)" />
      <ellipse cx="100" cy="92" rx="54" ry="14" fill="var(--wf-mint-100)" />
      <path d="M52 80a48 26 0 0 0 96 0z" fill="var(--wf-white)" stroke="var(--wf-mint-200)" strokeWidth="3" />
      <circle cx="84" cy="74" r="10" fill="var(--wf-emerald)" opacity="0.85" />
      <circle cx="104" cy="70" r="8" fill="var(--wf-macro-carbs)" opacity="0.8" />
      <circle cx="120" cy="76" r="7" fill="var(--wf-macro-fat)" opacity="0.85" />
      <path d="M150 30c8 11 13 18 13 25a13 13 0 0 1-26 0c0-7 5-14 13-25z" fill="var(--wf-blue)" />
      <circle cx="48" cy="38" r="15" fill="var(--wf-accent-fill)" />
      <path d="m41 38 5 5 9-10" fill="none" stroke="var(--wf-white)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Primeiro acesso em 3 telas: valor, "sobre você" em cartões e o primeiro passo.
 * O restaurar backup e "Personalizar alimentação" ficam na primeira tela.
 */
export function StarterFlow({
  name,
  onName,
  goal,
  onGoal,
  consent,
  onConsent,
  habitIndex,
  onHabit,
  error,
  busy,
  onSubmit,
  onPersonalize,
}: Props) {
  const [screen, setScreen] = useState(0);
  const [stepError, setStepError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  // A cada troca de tela, o foco vai para o título (leitores de tela anunciam a nova tela).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [screen]);
  const next = () => {
    if (screen === 1) {
      if (name.trim().length < 2) return setStepError("Informe seu nome.");
      if (!goal) return setStepError("Escolha seu objetivo.");
    }
    setStepError("");
    setScreen((current) => current + 1);
  };
  const back = () => {
    setStepError("");
    setScreen((current) => current - 1);
  };
  return (
    <div className="starter-flow">
      <div className="starter-flow-top">
        {screen > 0 ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Voltar para a tela anterior"
            onClick={back}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        ) : (
          <span className="starter-flow-spacer" />
        )}
        <ol className="starter-dots" aria-label={`Tela ${screen + 1} de 3: ${SCREENS[screen]}`}>
          {SCREENS.map((title, index) => (
            <li key={title} className={index <= screen ? "on" : ""} aria-hidden="true" />
          ))}
        </ol>
        <span className="starter-flow-spacer" />
      </div>
      {screen === 0 && (
        <section className="starter-screen starter-welcome" aria-labelledby="starter-title-0">
          <LogoMark size={44} />
          <WelcomeArt />
          <h1 id="starter-title-0" ref={heading} tabIndex={-1}>
            Sua rotina começa aqui
          </h1>
          <ul className="starter-values">
            {VALUES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span aria-hidden="true">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <button type="button" className="btn starter-cta" onClick={next}>
            Começar
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className="text-btn" disabled={busy} onClick={onPersonalize}>
            Personalizar alimentação
          </button>
          <div className="starter-restore">
            <span className="hint">Já usou o WebFit?</span>
            <RestoreBackup />
          </div>
        </section>
      )}
      {screen > 0 && (
        <form
          className="starter-screen stack"
          noValidate
          // Enter antes da última tela avança, em vez de tentar salvar sem consentimento.
          onSubmit={(event) => {
            if (screen < SCREENS.length - 1) {
              event.preventDefault();
              next();
            } else onSubmit(event);
          }}
        >
          {screen === 1 && (
            <>
              <h1 id="starter-title-1" ref={heading} tabIndex={-1}>
                Sobre você
              </h1>
              <Field label="Como você se chama?">
                <input
                  value={name}
                  maxLength={100}
                  autoComplete="given-name"
                  required
                  minLength={2}
                  onChange={(event) => {
                    onName(event.target.value);
                    setStepError("");
                  }}
                />
              </Field>
              <fieldset className="starter-goals">
                <legend>O que você quer melhorar?</legend>
                {STARTER_GOALS.map(([value, label]) => {
                  const Icon = GOAL_ICONS[value];
                  return (
                    <label key={value} className={`starter-goal ${goal === value ? "on" : ""}`}>
                      <input
                        type="radio"
                        name="starter-goal"
                        value={value}
                        checked={goal === value}
                        onChange={() => {
                          onGoal(value);
                          setStepError("");
                        }}
                      />
                      <span className="starter-goal-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <span>{label}</span>
                    </label>
                  );
                })}
              </fieldset>
              {stepError && (
                <p className="field-error" role="alert">
                  {stepError}
                </p>
              )}
              <button type="button" className="btn starter-cta" onClick={next}>
                Continuar
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </>
          )}
          {screen === 2 && (
            <>
              <h1 id="starter-title-2" ref={heading} tabIndex={-1}>
                Seu primeiro passo
              </h1>
              <fieldset className="starter-choices">
                <legend>Seu primeiro combinado (opcional)</legend>
                {HABIT_SUGGESTIONS.map((suggestion, index) => (
                  <label key={suggestion.title} className={habitIndex === index ? "on" : ""}>
                    <input
                      type="radio"
                      name="starter-habit"
                      checked={habitIndex === index}
                      onChange={() => onHabit(index)}
                    />
                    <span>
                      {suggestion.title}
                      <small>{suggestion.timeOfDay}</small>
                    </span>
                  </label>
                ))}
                <label className={habitIndex === null ? "on" : ""}>
                  <input
                    type="radio"
                    name="starter-habit"
                    checked={habitIndex === null}
                    onChange={() => onHabit(null)}
                  />
                  <span>Escolher depois</span>
                </label>
              </fieldset>
              <div className="starter-privacy">
                <label className="starter-consent">
                  <span>Concordo em salvar minhas respostas e registros neste navegador.</span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={consent}
                    onChange={(event) => onConsent(event.target.checked)}
                  />
                </label>
                <p className="hint">
                  Sem conta nem sincronização entre aparelhos. Você pode exportar ou excluir seus
                  dados quando quiser.
                </p>
              </div>
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn starter-cta" disabled={busy}>
                {busy ? "Salvando…" : "Começar com combinados"}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
