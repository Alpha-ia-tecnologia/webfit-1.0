import { AI_CONSENT_VERSION } from "@shared/lib/consent";
import { ANAMNESE_FINISH_LABEL } from "@shared/lib/copy";
import { RestoreBackup } from "@/components/restore-backup";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, SlidersHorizontal } from "lucide-react-native";
import { useEffect, useId, useRef, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  completion,
  groupStartOf,
  initialStep,
  isAnswered as fieldAnswered,
  MILESTONE_MESSAGES,
  pendingMessage,
  reachedMilestone,
  renderableFields,
  stepProgress,
} from "@shared/components/anamnese/progress";
import { profileToDraft, withConditionIssues } from "@shared/components/anamnese/condition-choice";
import { questionnaire, type Question } from "@shared/data/questionnaire";
import {
  applyAnswer,
  finalizeAnswers,
  prefilledKeys,
  withDerivedDefaults,
  withFlowMarker,
} from "@shared/lib/anamnese-flow";
import { localTime } from "@shared/lib/dates";
import { emptyDraft, localDate, uid } from "@shared/lib/domain";
import { completeAnamnese, penFirstEntry } from "@shared/lib/pen-setup";
import {
  goalChangePreview,
  isSectionDirty,
  saveSection,
  SECTION_EDIT_COPY,
  sectionIssues,
} from "@shared/lib/profile-summary";
import { profileSchema, type Draft } from "@shared/types";
import { onDevice } from "@/components/anamnese/device-copy";
import { AdjustSheet } from "@/components/anamnese/adjust-sheet";
import { acceptsAbout } from "@/components/anamnese/anamnese-field";
import { KnownAnswers } from "@/components/anamnese/known-answers";
import { QHelpLine } from "@/components/anamnese/q-block";
import { QuestionGroup } from "@/components/anamnese/question-group";
import { ReviewStep } from "@/components/anamnese/review-step";
import { SECTION_PREVIEW_SPACE, SectionFooter } from "@/components/anamnese/section-footer";
import { stageAbout } from "@/components/anamnese/stage-about";
import { StageHeading } from "@/components/anamnese/stage-heading";
import { StepBar, type SaveStatus } from "@/components/anamnese/step-bar";
import { AppText, Button } from "@/components/ui";
import { confirmAsync } from "@/lib/confirm";
import { focusNode } from "@/lib/focus";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const DRAFT_DELAY_MS = 500;
/** Espaço acima do campo pendente ao rolar até ele (barra fixa + respiro). */
const FIELD_SCROLL_OFFSET = 110;
/** Altura reservada para o rodapé fixo (botão de 56 + respiros), como o padding do web no celular. */
const FOOTER_SPACE = 112;
/** Altura do brilho menta no alto da página (o ::before da .anamnese no celular). */
const GLOW_HEIGHT = 440;
/** Até esta largura, "Ajustar" e "Começar meu dia" perdem respiro para caber numa linha (como o web). */
const NARROW_FOOTER_WIDTH = 400;
const SAVED_TOAST = "Anamnese salva. Seu espaço está pronto.";
const SAVED_WITH_PEN_TOAST = "Anamnese salva. Aplicação registrada no diário.";

type Group = { title: string; fields: Question[] };

/** "?secao=N" do hub "Seu perfil de saúde": inteiro de 0 até a etapa antes da revisão. */
function sectionParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return null;
  const index = Number(value);
  return index < questionnaire.length - 1 ? index : null;
}

/**
 * Anamnese em oito etapas com controles interativos; grava rascunho e conclui com updateProfile.
 * Com perfil salvo e "?secao=N", edita só aquela seção (sem rascunho, marcos, revisão nem dieta).
 */
export function AnamneseScreen({
  onBackToHabits,
}: { onBackToHabits?: () => void } = {}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit, cancelAi, notify, aiReady, requestDietPlan } =
    useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isNarrowFooter = useWindowDimensions().width <= NARROW_FOOTER_WIDTH;
  const { secao } = useLocalSearchParams<{ secao?: string }>();
  const [editIndex] = useState(() =>
    state.profile && !onBackToHabits ? sectionParam(secao) : null,
  );
  const sectionMode = editIndex !== null;
  const [initialAnswers] = useState<Draft>(() =>
    sectionMode && state.profile
      ? profileToDraft(state.profile)
      : (state.draft ??
        (state.profile ? profileToDraft(state.profile) : emptyDraft())),
  );
  const [answers, setAnswers] = useState<Draft>(initialAnswers);
  // Objetivo e consentimento que chegaram do primeiro acesso viram "O que você já contou" (etapa 1).
  const [known] = useState(() => prefilledKeys(initialAnswers));
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [examBusy, setExamBusy] = useState(false);
  useEffect(() => {
    if (!answers.consentAi) setSelectedExams([]);
  }, [answers.consentAi]);
  const [step, setStep] = useState(
    () => editIndex ?? initialStep(state.draft, state.draftStep),
  );
  // A montagem do plano aparece uma vez, logo depois de "Salvar e continuar" na etapa anterior.
  const [animateReveal, setAnimateReveal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("");
  const [showAbout, setShowAbout] = useState(false);
  // "Ajustar" na última etapa: as respostas por etapa numa folha, com "Editar esta etapa".
  const [isAdjustOpen, setAdjustOpen] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const title = useRef<View>(null);
  const finishing = useRef(false);
  const barY = useRef(0);
  // Corpo do formulário: base da medida até o campo pendente (no Fabric, measureLayout só aceita refs).
  const formBody = useRef<View>(null);
  const formBodyY = useRef(0);
  const fieldRefs = useRef<Record<string, View | null>>({});
  const firstRender = useRef(true);

  useEffect(() => {
    // O editor de seção grava só em "Salvar alterações" (nunca vira rascunho).
    if (sectionMode || !answers.consentLocal || finishing.current) return;
    const timer = setTimeout(() => {
      if (finishing.current) return;
      void commit((s) =>
        finishing.current
          ? s
          : { ...s, draft: withFlowMarker(answers), draftStep: step },
      ).then((ok) => setSaveStatus(ok ? "saved" : "failed"));
    }, DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [answers, step, commit, sectionMode]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    scroller.current?.scrollTo({ y: barY.current, animated: false });
    // Leitor de tela no aparelho: a nova etapa começa pelo título (no web o foco fica no botão).
    if (Platform.OS !== "web" && title.current)
      AccessibilityInfo.sendAccessibilityEvent(title.current, "focus");
  }, [step]);

  const overall = completion(answers);
  // Marcos de 50% e 100% viram um aviso acolhedor, uma vez por sessão ao cruzá-los.
  const lastPercent = useRef(overall.percent);
  const shownMilestones = useRef(new Set<number>());
  useEffect(() => {
    const milestone = reachedMilestone(lastPercent.current, overall.percent);
    lastPercent.current = overall.percent;
    // Apagar e reescrever uma resposta não repete o aviso; o editor de seção não comemora.
    if (sectionMode || !milestone || shownMilestones.current.has(milestone)) return;
    shownMilestones.current.add(milestone);
    notify(MILESTONE_MESSAGES[milestone], "success");
  }, [overall.percent, notify, sectionMode]);

  const today = localDate();
  const section = questionnaire[step]!;
  const lastStep = questionnaire.length - 1;
  const knownKeys = step === 0 && !sectionMode ? known : [];
  const visibleFields = renderableFields(section.fields, answers, knownKeys, today);
  const groups = visibleFields.reduce<Group[]>((result, field) => {
    const start = groupStartOf(field.key);
    if (!result.length || start)
      result.push({
        title: start?.title ?? section.title,
        fields: [],
      });
    result[result.length - 1]!.fields.push(field);
    return result;
  }, []);
  const stepAnswers = stepProgress(answers, section.fields);
  const isAnswered = (field: Question) => fieldAnswered(answers, field);

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
  const changeStep = (next: number, reveal = false) => {
    if (busy || examBusy) return;
    setErrors({});
    setShowAbout(false);
    setAnimateReveal(reveal);
    setStep(next);
  };
  /** Grava uma resposta e o que depende dela (sono, silêncio, dia da caneta, confirmação). */
  const set = (key: string, value: string | boolean) => {
    setAnswers((a) => applyAnswer(a, key, value));
    setErrors((e) => ({ ...e, [key]: "" }));
    setSaveStatus("");
  };
  /** Várias respostas de um mesmo controle (macros, "Voltar ao recomendado"). */
  const setMany = (values: Record<string, string>) => {
    setAnswers((a) =>
      Object.entries(values).reduce(
        (next, [key, value]) => applyAnswer(next, key, value),
        a,
      ),
    );
    setErrors((e) => ({
      ...e,
      ...Object.fromEntries(Object.keys(values).map((key) => [key, ""])),
    }));
    setSaveStatus("");
  };
  const onDateChecked = (key: string, message: string) =>
    setErrors((e) => ({ ...e, [key]: message }));
  const registerField = (keys: string[], node: View | null) => {
    for (const key of keys) fieldRefs.current[key] = node;
  };
  /** Erros das chaves da etapa (ou de todas, na revisão) no fluxo linear. */
  const stepErrors = (values: Draft) => {
    const parsed = profileSchema.safeParse({
      ...values,
      aiConsentVersion: AI_CONSENT_VERSION,
    });
    const keys = section.fields.map((f) => f.key);
    const next: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (step === lastStep || keys.includes(key)) next[key] = issue.message;
      }
    return next;
  };
  const validate = (values: Draft) => {
    const fields =
      step === lastStep
        ? questionnaire.flatMap((s) => s.fields)
        : section.fields;
    // Editor de seção: o que a mudança quebra em outra etapa vira aviso (e bloqueia o salvar).
    const { fields: schemaErrors, outside } = sectionMode
      ? sectionIssues(values, step)
      : { fields: stepErrors(values), outside: [] };
    // Condições: sem nenhuma marcada (inclusive perfis antigos, só com texto), pede a escolha.
    const next = withConditionIssues(values, schemaErrors, fields.map((f) => f.key));
    setErrors(next);
    const pending = fields.filter((f) => next[f.key]);
    if (pending.length) {
      notify(pendingMessage(pending.map((f) => onDevice(f.label))), "warning");
      const first = pending.find((f) => fieldRefs.current[f.key]);
      if (first) requestAnimationFrame(() => scrollToField(first.key));
    } else if (outside.length)
      notify(SECTION_EDIT_COPY.outside(outside.map(onDevice)), "warning");
    return pending.length === 0 && outside.length === 0;
  };
  /** Rola até o campo (posição medida em relação ao conteúdo da rolagem), deixando a barra fixa livre. */
  const scrollToField = (key: string) => {
    const node = fieldRefs.current[key];
    const body = formBody.current;
    if (!node || !body) return;
    node.measureLayout(
      body,
      (_x, y) => {
        scroller.current?.scrollTo({
          y: Math.max(0, formBodyY.current + y - FIELD_SCROLL_OFFSET),
          animated: true,
        });
        // No aparelho o leitor de tela vai para a pergunta pendente (o web foca o campo inválido).
        focusNode(node);
      },
      () => undefined,
    );
  };
  const backToSpace = () =>
    router.canGoBack() ? router.back() : router.replace("/espaco");
  /** Sair antes do fim: volta aos hábitos (primeiro acesso) ou ao Meu espaço. */
  const leave = onBackToHabits
    ? () => void returnToHabits()
    : state.profile
      ? backToSpace
      : null;
  /** Editor de seção: mudanças não salvas pedem confirmação antes de descartar. */
  const leaveSection = async () => {
    if (busy) return;
    const isDirty = state.profile && isSectionDirty(state.profile, answers, step);
    if (
      isDirty &&
      !(await confirmAsync(
        SECTION_EDIT_COPY.discardTitle,
        SECTION_EDIT_COPY.discardMessage,
        SECTION_EDIT_COPY.discardConfirm,
        true,
      ))
    )
      return;
    backToSpace();
  };
  // O voltar do Android também pede para descartar: o editor de seção não guarda rascunho.
  const leaveSectionRef = useRef(leaveSection);
  useEffect(() => {
    leaveSectionRef.current = leaveSection;
  });
  useEffect(() => {
    if (!sectionMode) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      void leaveSectionRef.current();
      return true;
    });
    return () => sub.remove();
  }, [sectionMode]);
  const backLabel = sectionMode
    ? SECTION_EDIT_COPY.back
    : step > 0
      ? "Voltar para a etapa anterior"
      : onBackToHabits
        ? "Salvar e voltar aos combinados"
        : state.profile
          ? "Voltar para Meu espaço"
          : "Início da anamnese";
  /** Salva só a seção (medição na data e meta do dia, como a anamnese completa) e volta. */
  const saveSectionEdit = async () => {
    const prepared = finalizeAnswers(
      withDerivedDefaults(answers, section.fields.map((f) => f.key)),
    );
    if (prepared !== answers) setAnswers(prepared);
    if (!validate(prepared)) return;
    setBusy(true);
    if (prepared.consentAi === false && state.profile?.consentAi) cancelAi();
    if (
      await commit(
        (s) => saveSection(s, prepared, step),
        SECTION_EDIT_COPY.saved(section.title),
      )
    )
      backToSpace();
    setBusy(false);
  };
  const submit = async () => {
    if (busy || examBusy) return;
    if (sectionMode) return void saveSectionEdit();
    // "Salvar e continuar" completa o que a linha do dia deriva (refeições, horas de sono).
    const prepared = withDerivedDefaults(
      answers,
      section.fields.map((f) => f.key),
    );
    if (prepared !== answers) setAnswers(prepared);
    if (!validate(prepared)) return;
    setBusy(true);
    if (step < lastStep) {
      const next = step + 1;
      if (
        await commit((s) => ({
          ...s,
          draft: withFlowMarker(prepared),
          draftStep: next,
        }))
      ) {
        changeStep(next, next === lastStep);
        setSaveStatus("saved");
      }
    } else {
      const final = finalizeAnswers(prepared);
      const p = profileSchema.parse({
        ...final,
        aiConsentVersion: AI_CONSENT_VERSION,
      });
      // A última aplicação só entra com confirmação explícita e como primeira aplicação.
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
          entry ? SAVED_WITH_PEN_TOAST : SAVED_TOAST,
        )
      ) {
        if (p.consentAi && aiReady) {
          router.replace("/dieta");
          void requestDietPlan(selectedExams);
        } else router.replace("/");
      } else finishing.current = false;
    }
    setBusy(false);
  };

  // "ⓘ Por quê?": na linha de ajuda da 1ª pergunta (escolhas) ou numa linha própria no topo.
  const leadField = groups[0]?.fields[0];
  const about =
    step === lastStep
      ? null
      : stageAbout({
          isOpen: showAbout,
          onToggle: () => setShowAbout((open) => !open),
          summary: section.summary,
          description: section.description,
          onLeave: leave && !sectionMode ? leave : undefined,
          isLeaveDisabled: busy || examBusy,
        });
  const isAboutInField = !!leadField && acceptsAbout(leadField);
  const preview =
    sectionMode && state.profile ? goalChangePreview(state.profile, answers) : null;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <PageGlow />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroller}
          testID="anamnese-scroll"
          stickyHeaderIndices={[0]}
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom:
                FOOTER_SPACE + insets.bottom + (preview ? SECTION_PREVIEW_SPACE : 0),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* .anamnese-bar-sticky: barra única em vidro no tom da página, fixa ao rolar */}
          <View
            style={styles.barSticky}
            onLayout={(event) => {
              barY.current = event.nativeEvent.layout.y;
            }}
          >
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
                  ? void leaveSection()
                  : step > 0
                    ? changeStep(step - 1)
                    : leave?.()
              }
              label={sectionMode ? SECTION_EDIT_COPY.barLabel : undefined}
              hideProgress={sectionMode}
            />
          </View>

          {/* form.stack: a página sem cartão (conceito 07), 28 px entre os blocos */}
          <View
            ref={formBody}
            style={styles.formBody}
            onLayout={(event) => {
              formBodyY.current = event.nativeEvent.layout.y;
            }}
          >
            <StageHeading titleRef={title} title={section.title} />

            {about && !isAboutInField && (
              <View style={styles.aboutLine}>
                <QHelpLine text={section.summary} about={about.button} />
                {about.panel}
              </View>
            )}

            {knownKeys.length > 0 && (
              <KnownAnswers
                keys={knownKeys}
                answers={answers}
                error={errors.goal}
                set={set}
              />
            )}

            {groups.map((group, index) => (
              <QuestionGroup
                key={group.fields[0]!.key}
                title={group.title}
                groupFields={group.fields}
                isFollowing={index > 0}
                leadKey={leadField?.key}
                about={about && isAboutInField ? about : undefined}
                isPenOpen={sectionMode}
                registerField={registerField}
                answers={answers}
                errors={errors}
                fields={section.fields}
                today={today}
                injectionsCount={state.injections.length}
                canRegisterPen={!sectionMode}
                set={set}
                setMany={setMany}
                onDateChecked={onDateChecked}
              />
            ))}

            {step === 0 && !state.profile && (
              <View style={styles.restore}>
                <AppText
                  size={fontSize.xs}
                  color={colors.muted}
                  lineHeight={18}
                  style={styles.restoreText}
                >
                  Já usou o WebFit? Traga seu backup.
                </AppText>
                <RestoreBackup />
              </View>
            )}

            {step === lastStep && (
              <ReviewStep
                answers={answers}
                selectedExams={selectedExams}
                onSelectExams={setSelectedExams}
                busy={busy}
                onExamBusy={setExamBusy}
                hasErrors={Object.values(errors).some(Boolean)}
                aiReady={aiReady}
                animateReveal={animateReveal}
                injectionsCount={state.injections.length}
                onChange={set}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* .anamnese-form-footer: só o botão sobre o fundo que se apaga (sem barra nem fio) */}
      <View
        style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}
      >
        <LinearGradient
          colors={[colors.pageFade, colors.bg, colors.bg]}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {sectionMode ? (
          <SectionFooter
            preview={preview}
            busy={busy}
            onCancel={() => void leaveSection()}
            onSave={() => void submit()}
          />
        ) : (
          <View style={styles.footerActions}>
            {step === lastStep && (
              <Button
                label="Ajustar"
                variant="secondary"
                icon={SlidersHorizontal}
                hasPopup="dialog"
                // Com um exame ainda sem salvar, trocar de etapa não acontece: "Ajustar" espera, como o principal.
                disabled={busy || examBusy}
                onPress={() => setAdjustOpen(true)}
                size="lg"
                labelSize={fontSize.md}
                labelWeight={800}
                style={[styles.adjustButton, isNarrowFooter && styles.footerButtonNarrow]}
              />
            )}
            <Button
              label={
                busy
                  ? "Salvando…"
                  : step === lastStep
                    ? ANAMNESE_FINISH_LABEL
                    : "Salvar e continuar"
              }
              iconRight={busy ? undefined : ArrowRight}
              disabled={busy || examBusy}
              onPress={() => void submit()}
              size="lg"
              labelWeight={700}
              style={[styles.footerButton, isNarrowFooter && styles.footerButtonNarrow]}
            />
          </View>
        )}
      </View>
      {isAdjustOpen && step === lastStep ? (
        <AdjustSheet
          answers={answers}
          isAnswered={isAnswered}
          onEditStep={(next) => {
            setAdjustOpen(false);
            changeStep(next);
          }}
          onClose={() => setAdjustOpen(false)}
        />
      ) : null}
    </View>
  );
}

/** Brilho menta no alto à direita da página (o ::before da .anamnese no celular), atrás do conteúdo. */
function PageGlow() {
  const styles = useStyles();
  const colors = useThemeColors();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View
      style={styles.glow}
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`${id}-mint`} cx="100" cy="0" rx="70" ry="90" fx="100" fy="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.mint50} stopOpacity={1} />
            <Stop offset="0.72" stopColor={colors.mint50} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id}-mint)`} />
      </Svg>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  // Página inteira sobre o fundo (conceito 07): sem cartão, 16 px nas laterais.
  content: { paddingHorizontal: 16 },
  // .anamnese-bar-sticky: vidro no tom da página, de ponta a ponta.
  barSticky: {
    marginHorizontal: -16,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.glassPage,
  },
  formBody: { gap: 28, marginTop: 22 },
  aboutLine: { gap: 10 },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: GLOW_HEIGHT },
  // .anamnese-restore: restaurar backup no fim da primeira etapa
  restore: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 14,
    rowGap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  restoreText: { flexShrink: 1 },
  // .anamnese-form-footer: fixo na base; o degradê do fundo fica por trás do botão.
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  // .anamnese-form-footer .form-actions: "Ajustar" no tamanho do texto e o principal com o resto.
  footerActions: { flexDirection: "row", gap: 12 },
  // .anamnese-form-footer .btn: 56 px e cantos de 16 (não pílula).
  footerButton: { flexGrow: 1, flexBasis: 0, minHeight: 56, borderRadius: radius.md },
  adjustButton: { flexGrow: 0, minHeight: 56, borderRadius: radius.md, paddingHorizontal: 20 },
  footerButtonNarrow: { paddingHorizontal: 16 },
}));
