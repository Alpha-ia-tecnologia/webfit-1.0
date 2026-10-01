import { AI_CONSENT_VERSION } from "../lib/consent";
import { RestoreBackup } from "./RestoreBackup";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { BODY_PRIVACY_COPY } from "../lib/body-privacy";
import { useApp } from "../lib/context";
import { ANAMNESE_FINISH_LABEL } from "../lib/copy";
import { emptyDraft, localDate, localTime, uid } from "../lib/domain";
import {
  applyAnswer,
  canShowBodyNumbers,
  finalizeAnswers,
  prefilledKeys,
  withDerivedDefaults,
  withFlowMarker,
} from "../lib/anamnese-flow";
import {
  completeAnamnese,
  penFirstEntry,
  penMedicationConflict,
} from "../lib/pen-setup";
import { SECTION_EDIT_COPY, sectionIssues } from "../lib/profile-summary";
import { profileSchema, type Draft } from "../types";
import { questionnaire, type Question } from "../data/questionnaire";
import { ANAMNESE_GROUPS, STAGE_ICONS } from "../data/anamneseOptions";
import "./Anamnese.css";
import "./anamnese/AnamneseInputs.css";
import "./anamnese/AnamneseWidgets.css";
import "./anamnese/AnamneseSchedule.css";
import {
  completion,
  essentialFields,
  initialStep,
  isAnswered as fieldAnswered,
  MILESTONE_MESSAGES,
  pendingMessage,
  reachedMilestone,
  renderableFields,
  stepProgress,
  widgetKeys,
} from "./anamnese/progress";
import { ECHO_KEYS, echoFor } from "./anamnese/echoes";
import { AdjustSheet } from "./anamnese/AdjustSheet";
import { acceptsAbout, AnamneseField } from "./anamnese/AnamneseField";
import { BmiGauge } from "./anamnese/BmiGauge";
import { CoherenceChip } from "./anamnese/CoherenceChip";
import { Echo } from "./anamnese/Echo";
import { GROUP_ICON } from "./anamnese/icons";
import { KnownAnswers } from "./anamnese/KnownAnswers";
import { MeasureFigure } from "./anamnese/MeasureFigure";
import { PenDetails } from "./anamnese/PenDetails";
import {
  PEN_DETAIL_KEYS,
  penDetailsComplete,
  penDetailsSummary,
} from "./anamnese/pen-details";
import { ReviewStep } from "./anamnese/ReviewStep";
import { SectionEditFooter } from "./anamnese/SectionEditFooter";
import { stageAbout } from "./anamnese/StageAbout";
import { StepBar, type SaveStatus } from "./anamnese/StepBar";
import { useSectionEdit } from "./anamnese/useSectionEdit";
import { WeightProjection } from "./anamnese/WeightProjection";
import { bmiOf } from "./anamnese/inputs";

/** Mola curta para marcas e selos: rápida, com leve sobressalto. */
const spring = { type: "spring" as const, stiffness: 520, damping: 26 };
const BIRTH_YEAR_MIN = 1900;
const ALL_FIELDS = questionnaire.flatMap((s) => s.fields);
const fieldOf = (key: string) => ALL_FIELDS.find((f) => f.key === key);

export function ScreenAnamnese({
  onBackToHabits,
}: { onBackToHabits?: () => void } = {}) {
  const {
    state,
    commit,
    navigate,
    cancelAi,
    notify,
    requestDietPlan,
    aiReady,
    setBackGuard,
  } = useApp();
  const reducedMotion = !!useReducedMotion();
  const today = localDate();
  // Hub "Seu perfil de saúde": uma seção só, a partir do perfil salvo (nunca do rascunho).
  const sectionEdit = useSectionEdit();
  const sectionMode = sectionEdit.section !== null;
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [examBusy, setExamBusy] = useState(false);
  const [answers, setAnswers] = useState<Draft>(() =>
    sectionMode && state.profile
      ? { ...state.profile }
      : (state.draft ?? (state.profile ? { ...state.profile } : emptyDraft())),
  );
  // Objetivo e consentimento que chegaram respondidos viram o cartão "O que você já contou".
  const [known] = useState(() => (sectionMode ? [] : prefilledKeys(answers)));
  useEffect(() => {
    if (!answers.consentAi) setSelectedExams([]);
  }, [answers.consentAi]);
  const [step, setStep] = useState(
      () => sectionEdit.section ?? initialStep(state.draft, state.draftStep),
    ),
    [direction, setDirection] = useState(1),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [saveStatus, setSaveStatus] = useState<SaveStatus>(""),
    [showAbout, setShowAbout] = useState(false),
    [isAdjustOpen, setAdjustOpen] = useState(false),
    [animateReveal, setAnimateReveal] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    finishing = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!sectionMode && answers.consentLocal && !finishing.current) {
      timer.current = setTimeout(() => {
        void commit((s) => ({
          ...s,
          draft: withFlowMarker(answers),
          draftStep: step,
        })).then((ok) => setSaveStatus(ok ? "saved" : "failed"));
      }, 500);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [answers, step, commit, sectionMode]);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const overall = completion(answers);
  // Marcos de 50% e 100% viram um aviso acolhedor, uma vez por sessão ao cruzá-los.
  const lastPercent = useRef(overall.percent);
  const shownMilestones = useRef(new Set<number>());
  useEffect(() => {
    // Editar uma seção não é percorrer a anamnese: sem avisos de marco.
    if (sectionMode) return;
    const milestone = reachedMilestone(lastPercent.current, overall.percent);
    lastPercent.current = overall.percent;
    // Apagar e reescrever uma resposta não repete o aviso.
    if (!milestone || shownMilestones.current.has(milestone)) return;
    shownMilestones.current.add(milestone);
    notify(MILESTONE_MESSAGES[milestone], "success");
  }, [overall.percent, notify, sectionMode]);
  const section = questionnaire[step];
  const lastStep = questionnaire.length - 1;
  const StageIcon = GROUP_ICON[STAGE_ICONS[step] ?? "clipboard"];
  const skipped = step === 0 ? known : [];
  const fields = renderableFields(section.fields, answers, skipped, today);
  const groups = fields.reduce<
    { title: string; icon: LucideIcon; fields: Question[] }[]
  >((result, field) => {
    const start = ANAMNESE_GROUPS[field.key];
    if (!result.length || start)
      result.push({
        title: start?.title ?? section.title,
        icon: start ? GROUP_ICON[start.icon] : StageIcon,
        fields: [],
      });
    result[result.length - 1].fields.push(field);
    return result;
  }, []);
  const stepAnswers = stepProgress(answers, section.fields);
  const requiredKeys = new Set(
    essentialFields(answers, section.fields, today).map((field) => field.key),
  );
  const isAnswered = (field: Question) => fieldAnswered(answers, field);
  const showBody = canShowBodyNumbers(answers, today);
  // "Ocultar números do corpo" (ESPACO-13): as réguas continuam (é a tela de correção), com aviso;
  // IMC, figura e projeção somem. canShowBodyNumbers não muda: apagaria o peso desejado.
  const bodyHidden = state.profile?.hideBodyNumbers === true;
  const changeStep = (next: number) => {
    if (busy || examBusy) return;
    setDirection(next > step ? 1 : -1);
    setErrors({});
    setShowAbout(false);
    setAdjustOpen(false);
    setAnimateReveal(false);
    setStep(next);
  };
  const set = (key: string, value: string | boolean) => {
    setAnswers((a) => applyAnswer(a, key, value));
    setErrors((e) => ({ ...e, [key]: "" }));
    setSaveStatus("");
  };
  /** Feedback imediato para datas fora da faixa aceita. */
  const checkDate = (key: string, value: string) => {
    if (!value) return;
    const year = Number(value.slice(0, 4));
    const message =
      year < BIRTH_YEAR_MIN
        ? "Informe um ano a partir de 1900."
        : value > localDate()
          ? "A data não pode estar no futuro."
          : "";
    setErrors((e) => ({ ...e, [key]: message }));
  };
  /** Erros da etapa; no editor de seção, também os rótulos de outras etapas que a mudança invalida. */
  const issuesOf = (values: Draft) => {
    if (sectionMode) return sectionIssues(values, step);
    const parsed = profileSchema.safeParse({
      ...values,
      aiConsentVersion: AI_CONSENT_VERSION,
    });
    const keys = section.fields.map((f) => f.key);
    const fields: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (step === lastStep || keys.includes(key)) fields[key] = issue.message;
      }
    return { fields, outside: [] as string[] };
  };
  const validate = (values: Draft) => {
    const { fields: next, outside } = issuesOf(values);
    setErrors(next);
    const checked = step === lastStep ? ALL_FIELDS : section.fields;
    const pending = checked.filter((f) => next[f.key]).map((f) => f.label);
    if (pending.length) notify(pendingMessage(pending), "warning");
    else if (outside.length)
      notify(SECTION_EDIT_COPY.outside(outside), "warning");
    if (Object.keys(next).length)
      requestAnimationFrame(() => {
        const target = form.current?.querySelector<HTMLElement>(
          '[data-field][aria-invalid="true"], input[aria-invalid="true"]:not(.q-mirror), textarea[aria-invalid="true"], select[aria-invalid="true"]:not([aria-hidden="true"])',
        );
        // preventScroll + block center: o campo fica visível entre a barra fixa e o rodapé fixo.
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    return Object.keys(next).length === 0 && outside.length === 0;
  };
  /** Figuras e avisos ao lado de uma pergunta, no mesmo grupo (nunca dentro do campo). */
  const before = (key: string): ReactNode => {
    if (key === "weight" && bodyHidden)
      return (
        <div className="anamnese-field-slot">
          <p className="notice">{BODY_PRIVACY_COPY.anamneseNotice}</p>
        </div>
      );
    return key === "waist" && showBody && !bodyHidden ? (
      <div className="anamnese-field-slot is-figure">
        <MeasureFigure waist={answers.waist} hip={answers.hip} />
      </div>
    ) : null;
  };
  const after = (key: string): ReactNode => {
    if (key === "height") {
      const bmi = bmiOf(answers.weight, answers.height);
      return showBody && !bodyHidden && bmi !== null ? (
        <div className="anamnese-field-slot">
          <BmiGauge bmi={bmi} />
        </div>
      ) : null;
    }
    if (key === "targetWeight")
      return bodyHidden ? null : (
        <div className="anamnese-field-slot is-figure">
          <WeightProjection answers={answers} today={today} />
        </div>
      );
    if (key === "weightLossPen") {
      const conflict = penMedicationConflict(answers);
      return conflict ? (
        <div className="anamnese-field-slot">
          <CoherenceChip
            text={conflict.text}
            actionLabel={conflict.actionLabel}
            onAction={() => set("medications", conflict.fix)}
          />
        </div>
      ) : null;
    }
    return null;
  };
  const returnToHabits = async () => {
    if (!onBackToHabits || busy || examBusy) return;
    if (!answers.consentLocal) {
      notify(
        "As alterações não foram salvas porque o armazenamento está desativado.",
        "info",
      );
      onBackToHabits();
      return;
    }
    finishing.current = true;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try {
      if (
        await commit((current) => ({
          ...current,
          draft: withFlowMarker(answers),
          draftStep: step,
        }))
      )
        onBackToHabits();
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  };
  const submit = async () => {
    if (busy || examBusy) return;
    // A linha do dia completa o que deriva (3 refeições, horas de sono) só da etapa enviada.
    const prepared = withDerivedDefaults(
      answers,
      section.fields.map((f) => f.key),
    );
    if (prepared !== answers) setAnswers(prepared);
    if (!validate(prepared)) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    // Uma seção só: salva o perfil e volta ao Meu espaço (sem revisão nem pedido de dieta).
    if (sectionMode) await sectionEdit.save(finalizeAnswers(prepared), step);
    else if (step < lastStep) {
      const next = step + 1;
      if (
        await commit((s) => ({
          ...s,
          draft: withFlowMarker(prepared),
          draftStep: next,
        }))
      ) {
        changeStep(next);
        // "Montando seu plano inicial…" só ao chegar à revisão pela etapa anterior.
        if (next === lastStep) setAnimateReveal(true);
        setSaveStatus("saved");
      }
    } else {
      const final = finalizeAnswers(prepared);
      const p = profileSchema.parse({
        ...final,
        aiConsentVersion: AI_CONSENT_VERSION,
      });
      const entry = state.injections.length
        ? null
        : penFirstEntry(final, {
            id: uid(),
            userId: state.userId,
            nowIso: new Date().toISOString(),
            today: localDate(),
            now: localTime(),
          });
      finishing.current = true;
      cancelAi();
      if (
        await commit(
          (s) => completeAnamnese(s, p, entry),
          entry
            ? "Anamnese salva. Aplicação registrada no diário."
            : "Anamnese salva. Seu espaço está pronto.",
        )
      ) {
        if (p.consentAi && aiReady) {
          navigate("dieta");
          void requestDietPlan(selectedExams);
        } else {
          navigate("hoje");
        }
      } else finishing.current = false;
    }
    setBusy(false);
  };
  /** Editor de seção: "Cancelar" e voltar pedem para descartar o que não foi salvo. */
  const leaveSection = () => {
    if (!busy) void sectionEdit.leave(answers, step);
  };
  // O "Voltar" do cabeçalho (desktop) também pede para descartar, com as respostas atuais.
  const leaveRef = useRef(leaveSection);
  useEffect(() => {
    leaveRef.current = leaveSection;
  });
  useEffect(() => {
    if (!sectionMode) return;
    setBackGuard(() => leaveRef.current());
    return () => setBackGuard(null);
  }, [sectionMode, setBackGuard]);
  /** Sair antes do fim: volta aos hábitos (primeiro acesso) ou ao Meu espaço. */
  const leave = onBackToHabits
    ? () => void returnToHabits()
    : state.profile
      ? () => navigate("espaco")
      : null;
  const backLabel = sectionMode
    ? SECTION_EDIT_COPY.back
    : step > 0
      ? "Voltar para a etapa anterior"
      : onBackToHabits
        ? "Salvar e voltar aos combinados"
        : state.profile
          ? "Voltar para Meu espaço"
          : "Início da anamnese";
  // "ⓘ Por quê?": na linha de ajuda da 1ª pergunta (escolhas) ou numa linha própria no topo.
  const leadField = groups[0]?.fields[0];
  const about =
    step === lastStep
      ? null
      : stageAbout({
          id: "anamnese-stage-about",
          isOpen: showAbout,
          onToggle: () => setShowAbout((open) => !open),
          summary: section.summary,
          description: section.description,
          onLeave: leave && !sectionMode ? leave : undefined,
          isLeaveDisabled: busy || examBusy,
        });
  const isAboutInField = !!leadField && acceptsAbout(leadField);
  /** Uma pergunta com as figuras e avisos ao lado (a 1ª da etapa ganha o título grande). */
  const renderField = (f: Question, groupId: string) => (
    <Fragment key={f.key}>
      {before(f.key)}
      <div
        className={[
          "anamnese-field-slot",
          f.key === leadField?.key ? "is-lead" : "",
          f.key === "weightLossPen" ? "is-pen" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <AnamneseField
          field={f}
          answers={answers}
          errors={errors}
          stepFields={section.fields}
          groupLabelId={groupId}
          injectionsCount={state.injections.length}
          canRegisterPen={!sectionMode}
          today={today}
          reducedMotion={reducedMotion}
          onChange={set}
          onDateChange={(key, value) => {
            set(key, value);
            checkDate(key, value);
          }}
          about={
            about && isAboutInField && f.key === leadField?.key
              ? about
              : undefined
          }
        />
        {ECHO_KEYS.has(f.key) && (
          <Echo
            text={echoFor(f.key, answers)}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
      {after(f.key)}
    </Fragment>
  );
  return (
    <main className="onboarding anamnese" data-reduced-motion={reducedMotion}>
      {/* Coluna de contexto só no desktop; no celular a barra de etapa é o único cabeçalho. */}
      <aside className="onboarding-aside">
        <span className="pill">
          <ClipboardList size={15} aria-hidden="true" /> ANAMNESE PESSOAL
        </span>
        <h1>
          O cuidado começa
          <br />
          por conhecer você.
        </h1>
        <p>
          Seu histórico, suas preferências e sua rotina formam o ponto de
          partida do acompanhamento.
        </p>
        <ol className="step-list">
          {questionnaire.map((s, i) => (
            <li
              key={s.title}
              className={step === i ? "current" : step > i ? "done" : ""}
              aria-current={step === i ? "step" : undefined}
            >
              <span>
                {step > i ? (
                  <motion.span
                    className="anamnese-step-check"
                    initial={reducedMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={reducedMotion ? { duration: 0 } : spring}
                  >
                    <Check size={16} aria-hidden="true" />
                  </motion.span>
                ) : (
                  i + 1
                )}
              </span>
              {s.title}
            </li>
          ))}
        </ol>
        <div className="aside-note">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            Você decide o que compartilhar. Nas perguntas de saúde, pode
            informar que não sabe ou prefere não responder.
          </p>
        </div>
      </aside>
      <div className="onboarding-form">
        <StepBar
          step={step}
          total={questionnaire.length}
          title={section.title}
          short={section.short}
          answered={stepAnswers.answered}
          required={stepAnswers.total}
          saveStatus={sectionMode ? "" : saveStatus}
          backLabel={backLabel}
          isBackDisabled={!sectionMode && step === 0 && !leave}
          onBack={() =>
            sectionMode
              ? leaveSection()
              : step > 0
                ? changeStep(step - 1)
                : leave
                  ? leave()
                  : undefined
          }
          reducedMotion={reducedMotion}
          label={sectionMode ? SECTION_EDIT_COPY.barLabel : undefined}
          hideProgress={sectionMode}
        />
        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            className="anamnese-stage"
            initial={reducedMotion ? false : { opacity: 0, x: 28 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={
              reducedMotion ? undefined : { opacity: 0, x: -28 * direction }
            }
            transition={{
              duration: reducedMotion ? 0 : 0.22,
              ease: [0.16, 1, 0.3, 1],
            }}
            aria-labelledby="anamnese-stage-title"
          >
            {/* O nome da etapa já aparece na barra: o título fica para leitores de tela e para o foco. */}
            <header className="anamnese-stage-heading">
              <h2
                id="anamnese-stage-title"
                className="sr-only"
                ref={title}
                tabIndex={-1}
              >
                {section.title}
              </h2>
            </header>
            <form
              ref={form}
              className="stack"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {about && !isAboutInField && (
                <div className="anamnese-about-line">
                  <p className="q-help">
                    <span>{section.summary}</span>
                    <span className="q-help-dot" aria-hidden="true">
                      ·
                    </span>
                    {about.button}
                  </p>
                  {about.panel}
                </div>
              )}
              {skipped.length > 0 && (
                <KnownAnswers
                  keys={skipped}
                  answers={answers}
                  goalField={fieldOf("goal")}
                  consentField={fieldOf("consentLocal")}
                  error={errors.goal}
                  reducedMotion={reducedMotion}
                  onChange={set}
                />
              )}
              {groups.map((group, index) => {
                const GroupIcon = group.icon;
                const groupId = `anamnese-group-${group.fields[0].key}`;
                const covered = new Set(
                  group.fields.flatMap((f) =>
                    widgetKeys(f, section.fields, answers),
                  ),
                );
                const required = section.fields.filter(
                  (f) => covered.has(f.key) && requiredKeys.has(f.key),
                );
                const complete =
                  required.length > 0 && required.every(isAnswered);
                // Grupo de uma pergunta só: a própria pergunta é o título (o do grupo fica para leitores).
                const [only] = group.fields;
                const isSolo =
                  group.fields.length === 1 &&
                  (!only.widget || only.widget === "numbersChoice");
                const penFields = group.fields.filter((f) =>
                  PEN_DETAIL_KEYS.includes(f.key),
                );
                const hasPenError =
                  PEN_DETAIL_KEYS.some((key) => !!errors[key]) ||
                  !!errors.penWeekday;
                return (
                  <motion.section
                    key={group.fields[0].key}
                    className={`anamnese-question-card ${complete ? "is-complete" : ""}`}
                    data-complete={complete}
                    aria-labelledby={groupId}
                    initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.28,
                      delay: reducedMotion ? 0 : index * 0.045,
                    }}
                  >
                    <header
                      className={`anamnese-card-heading ${isSolo ? "is-solo" : ""}`}
                    >
                      <GroupIcon size={18} aria-hidden="true" />
                      <h3 id={groupId}>{group.title}</h3>
                      {complete && (
                        <motion.span
                          className="anamnese-card-check"
                          role="img"
                          aria-label="Bloco respondido"
                          initial={
                            reducedMotion ? false : { scale: 0, rotate: -30 }
                          }
                          animate={{ scale: 1, rotate: 0 }}
                          transition={reducedMotion ? { duration: 0 } : spring}
                        >
                          <Check size={13} strokeWidth={3} />
                        </motion.span>
                      )}
                    </header>
                    <div className="anamnese-fields">
                      {group.fields.map((f) => {
                        if (!PEN_DETAIL_KEYS.includes(f.key))
                          return renderField(f, groupId);
                        if (f !== penFields[0]) return null;
                        return (
                          <div
                            className="anamnese-field-slot"
                            key="pen-details"
                          >
                            <PenDetails
                              summary={penDetailsSummary(answers)}
                              isComplete={penDetailsComplete(answers)}
                              hasError={hasPenError}
                              isInitiallyOpen={sectionMode}
                            >
                              {penFields.map((pen) => renderField(pen, groupId))}
                            </PenDetails>
                          </div>
                        );
                      })}
                    </div>
                  </motion.section>
                );
              })}
              {step === 0 && !state.profile && (
                <div className="anamnese-restore">
                  <p className="hint">Já usou o WebFit? Traga seu backup.</p>
                  <RestoreBackup />
                </div>
              )}
              {step === lastStep && !sectionMode && (
                <ReviewStep
                  answers={answers}
                  selectedExams={selectedExams}
                  onSelectExams={setSelectedExams}
                  busy={busy}
                  onExamBusy={setExamBusy}
                  hasErrors={Object.values(errors).some(Boolean)}
                  overallPercent={overall.percent}
                  aiReady={aiReady}
                  reducedMotion={reducedMotion}
                  animateReveal={animateReveal}
                  onRevealed={() => setAnimateReveal(false)}
                  injectionsCount={state.injections.length}
                  onChange={set}
                  bodyHidden={bodyHidden}
                />
              )}
              {sectionMode ? (
                <SectionEditFooter
                  answers={answers}
                  busy={busy}
                  onCancel={leaveSection}
                />
              ) : (
                <div className="anamnese-form-footer">
                  <div className="form-actions">
                    {step > 0 && (
                      <button
                        type="button"
                        className="btn-secondary anamnese-back-btn"
                        disabled={busy}
                        onClick={() => changeStep(step - 1)}
                      >
                        <ArrowLeft size={17} aria-hidden="true" />
                        Voltar
                      </button>
                    )}
                    {step === lastStep && (
                      <button
                        type="button"
                        className="btn-secondary anamnese-adjust-btn"
                        aria-haspopup="dialog"
                        // Com um exame ainda sem salvar, "Editar esta etapa" não trocaria de etapa.
                        disabled={busy || examBusy}
                        onClick={() => setAdjustOpen(true)}
                      >
                        <SlidersHorizontal size={18} aria-hidden="true" />
                        Ajustar
                      </button>
                    )}
                    <button className="btn" disabled={busy || examBusy}>
                      {busy
                        ? "Salvando…"
                        : step === lastStep
                          ? ANAMNESE_FINISH_LABEL
                          : "Salvar e continuar"}
                      {!busy && <ArrowRight size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </motion.section>
        </AnimatePresence>
        {isAdjustOpen && step === lastStep && (
          <AdjustSheet
            answers={answers}
            isAnswered={isAnswered}
            onEditStep={(next) => {
              setAdjustOpen(false);
              changeStep(next);
            }}
            onClose={() => setAdjustOpen(false)}
          />
        )}
      </div>
    </main>
  );
}
