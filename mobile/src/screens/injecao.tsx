import { useRouter } from "expo-router";
import { Info, ScanLine } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View, type Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cycleCard } from "@shared/lib/cycle-tips";
import { localDate, uid } from "@shared/lib/domain";
import {
  DOSE_STEP_MG,
  STALE_RECIPE_TEXT,
  applyDoseMg,
  clampConcentration,
  clampUnits,
  customMedicationLabel,
  daysAgoLabel,
  doseBand,
  doseMg,
  doseOverflowText,
  doseRuler,
  fmtConcentration,
  fmtMl,
  injectionSummary,
  isPenMethod,
  medication,
  nearestMarkText,
  presetMatches,
  recentInjectionText,
  recentInjectionWarning,
  rulerDoseMg,
  safetyItems,
  spotLabel,
  stepVialDose,
  suggestedSide,
  unitsForDose,
  volumeMl,
  type MedicationKey,
} from "@shared/lib/injection";
import { planReminders } from "@shared/lib/reminder-plan";
import { rotationCallouts, rotationModel } from "@shared/lib/rotation";
import { nextApplicationModel, savedSheetModel } from "@shared/lib/treatment";
import { stockModel } from "@shared/lib/treatment-stock";
import type { InjectionEntry, InjectionMethod, InjectionSide, InjectionSite, SyringeUnits } from "@shared/types";
import { MeasurementSheet } from "@/components/evolucao/measurement-sheet";
import { ConfirmDoseSheet, recipeDose, type ConfirmDose } from "@/components/injecao/confirm-dose-sheet";
import { DoseCard } from "@/components/injecao/dose-card";
import { GuideSheet } from "@/components/injecao/guide-sheet";
import { InjectionBar } from "@/components/injecao/injection-bar";
import { LabelReadSheet } from "@/components/injecao/label-read-sheet";
import { seedFor } from "@/components/injecao/injection-seed";
import { MethodPicker } from "@/components/injecao/method-picker";
import { NextApplicationCard } from "@/components/injecao/next-application-card";
import { NoteRow } from "@/components/injecao/note-row";
import { RecentStrip } from "@/components/injecao/recent-strip";
import { RecipeHero } from "@/components/injecao/recipe-hero";
import { RotationCard } from "@/components/injecao/rotation-card";
import { SafetyChecklist } from "@/components/injecao/safety-checklist";
import { SavedSheet } from "@/components/injecao/saved-sheet";
import { SiteCard } from "@/components/injecao/site-card";
import { StockRow } from "@/components/injecao/stock";
import { StockSheet, type StockSheetMode } from "@/components/injecao/stock-sheet";
import { SyringeCard } from "@/components/injecao/syringe-card";
import { recipeInput, useInjectionSave, type InjectionWhen } from "@/components/injecao/use-injection-save";
import { WhenRow } from "@/components/injecao/when-row";
import { Screen } from "@/components/layout/screen";
import { QuickEntryForm } from "@/components/quick/quick-entry-form";
import { AppText, Button, Card, IconButton, Notice, Sheet } from "@/components/ui";
import { ScreenSignal } from "@/components/signals/screen-signal";
import { focusNode } from "@/lib/focus";
import { selectionHaptic } from "@/lib/haptics";
import { useTimeouts } from "@/lib/timeouts";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const TOAST_GAP = 16;
const MAX_UNITS = 100;
/** Espera a folha sumir antes de devolver o foco ao título "Últimas aplicações". */
const SHEET_FADE_MS = 350;
/** Atalho ligado pela dose em mg (caneta, ou dose que não cabe na seringa e não tem UI). */
const MG_PRESET_TOLERANCE = 0.005;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const aspire = (units: number | null) => (units === null ? "" : `Aspire até ${units} UI, ${fmtMl(volumeMl(units))}`);

/** Remonta a calculadora quando o Hoje pede o formulário direto ("Outra dose ou frasco novo"). */
export function InjecaoScreen() {
  const { injectionView } = useApp();
  return <InjecaoContent key={injectionView} />;
}

/**
 * Seringa e dose: "Sua dose de sempre" em dois toques ou o formulário (modo de aplicação, dose prescrita
 * num único valor, seringa, local, quando). Nada é sugerido nem grampeado; registrar sempre passa pela
 * folha de confirmação (a edição salva direto).
 */
function InjecaoContent() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, notify, editingInjection: editing, openInjection, injectionView, setToastBottom, setDate, aiReady } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { save, undo, isBusy } = useInjectionSave();
  const p = state.profile!;
  const today = localDate();
  const perMonth = p.weightLossPenPerMonth;
  const summary = injectionSummary(state.injections, today);
  const customLabel = customMedicationLabel(p.weightLossPenName);
  const [seed] = useState(() => seedFor({ editing, list: state.injections, profile: p, today, view: injectionView }));
  const [view, setView] = useState(seed.view);
  const [method, setMethod] = useState<InjectionMethod>(seed.method);
  const [medKey, setMedKey] = useState<MedicationKey>(seed.medKey);
  const [concentration, setConcentration] = useState(seed.concentration);
  const [syringe, setSyringe] = useState<SyringeUnits>(seed.syringe);
  const [units, setUnits] = useState<number | null>(seed.units);
  const [targetMg, setTargetMg] = useState<number | null>(seed.targetMg);
  const [penDose, setPenDose] = useState<number | null>(seed.penDose);
  const [site, setSite] = useState<InjectionSite>(seed.site);
  const [side, setSide] = useState<InjectionSide | null>(seed.side);
  const [day, setDay] = useState(seed.day);
  const [time, setTime] = useState(seed.time);
  const [notes, setNotes] = useState(seed.notes);
  const [isFrascoOpen, setFrascoOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [confirm, setConfirm] = useState<"recipe" | "form" | null>(null);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const [isWarningDismissed, setWarningDismissed] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const [focusTarget, setFocusTarget] = useState<"frasco" | "dose" | null>(null);
  const [saved, setSaved] = useState<InjectionEntry | null>(null);
  const [isMoodOpen, setMoodOpen] = useState(false);
  const [isMeasuresOpen, setMeasuresOpen] = useState(false);
  const [isLabelOpen, setLabelOpen] = useState(false);
  const [stockMode, setStockMode] = useState<StockSheetMode | null>(null);
  const recentHeading = useRef<Text>(null);
  const scroller = useRef<ScrollView>(null);
  // Foco depois do fade das folhas: cancelado se a tela sair antes.
  const later = useTimeouts();
  const frascoToggle = useRef<View>(null);
  const doseButton = useRef<View | null>(null);

  const isPen = isPenMethod(method);
  const medLabel = (key: MedicationKey) =>
    key === seed.medKey && seed.medication ? seed.medication : key === "personalizado" ? customLabel : medication(key).label;
  const needed = !isPen && targetMg !== null && units === null ? unitsForDose(targetMg, concentration) : null;
  const isOverflow = needed !== null && needed > MAX_UNITS;
  const doseValue = isPen ? penDose : units !== null ? doseMg(units, concentration) : isOverflow ? targetMg : null;
  const canSave = isPen ? penDose !== null : units !== null;
  // Régua e faixa da bula pela dose prescrita quando a UI é a marca mais próxima dela (0,25 mg → 19 UI → "Inicial").
  const rulerMg = isPen ? penDose : rulerDoseMg(targetMg, units, concentration);
  const ruler = rulerMg !== null ? doseRuler(medKey, rulerMg) : null;
  const isPresetOn = (mg: number) =>
    isPen
      ? penDose !== null && Math.abs(mg - penDose) < MG_PRESET_TOLERANCE
      : units !== null
        ? presetMatches(mg, units, concentration)
        : isOverflow && targetMg !== null && Math.abs(mg - targetMg) < MG_PRESET_TOLERANCE;
  const overflowText = isOverflow && targetMg !== null && needed !== null ? doseOverflowText(targetMg, concentration, needed) : null;
  const isFormView = view === "form";

  useEffect(() => {
    if (!isFormView || !barHeight) return;
    setToastBottom(barHeight + TOAST_GAP + insets.bottom);
    return () => setToastBottom(null);
  }, [isFormView, barHeight, insets.bottom, setToastBottom]);
  useEffect(() => {
    if (!focusTarget) return;
    setFocusTarget(null);
    requestAnimationFrame(() => focusNode(focusTarget === "frasco" ? frascoToggle.current : doseButton.current));
  }, [focusTarget]);

  const applyVialDose = (mg: number, conc = concentration) => {
    const fit = applyDoseMg(mg, conc, syringe);
    setTargetMg(mg);
    setUnits(fit.units);
    setSyringe(fit.syringe);
    setAnnouncement(aspire(fit.units));
  };
  const setDose = (mg: number) => {
    if (!isPen) return applyVialDose(mg);
    setPenDose(mg);
    setTargetMg(mg);
  };
  const stepDose = (direction: 1 | -1) => {
    if (units !== null && direction > 0 && units >= MAX_UNITS) {
      // No topo da maior seringa, "+0,05 mg" segue o caminho da dose digitada: o estouro aparece, nunca some calado.
      const base = targetMg ?? doseMg(units, concentration);
      applyVialDose(Math.max(round3(base + DOSE_STEP_MG), doseMg(MAX_UNITS + 1, concentration)));
    } else if (units !== null) {
      const next = stepVialDose(units, concentration, syringe, direction);
      setUnits(next.units);
      setSyringe(next.syringe);
      setTargetMg(doseMg(next.units, concentration));
      setAnnouncement(aspire(next.units));
    } else if (isOverflow && targetMg !== null) applyVialDose(Math.max(DOSE_STEP_MG, round3(targetMg + direction * DOSE_STEP_MG)));
  };
  const setManualUnits = (next: number) => {
    const value = clampUnits(next, syringe);
    if (value === units) return;
    selectionHaptic();
    setUnits(value);
    setTargetMg(doseMg(value, concentration));
  };
  const changeConcentration = (value: number) => {
    const next = clampConcentration(value);
    setConcentration(next);
    if (targetMg !== null) applyVialDose(targetMg, next);
  };
  const pickSyringe = (next: SyringeUnits) => {
    if (next === syringe) return;
    if (units !== null && units > next) {
      notify(`${units} UI não cabem na seringa de ${next} UI. Use uma seringa maior ou revise a dose.`, "warning");
      return;
    }
    selectionHaptic();
    setSyringe(next);
    setAnnouncement(aspire(units));
  };
  const pickMedication = (key: MedicationKey) => {
    if (key === medKey) return;
    selectionHaptic();
    setMedKey(key);
    setConcentration(medication(key).concentration);
    setUnits(null);
    setTargetMg(null);
    setPenDose(null);
    setAnnouncement("");
    if (!isPen) setFrascoOpen(true);
  };
  const pickMethod = (next: InjectionMethod) => {
    if (next === method) return;
    selectionHaptic();
    const isNextPen = isPenMethod(next);
    setMethod(next);
    if (!isPen && isNextPen) setPenDose(doseValue);
    else if (isPen && !isNextPen && penDose !== null) applyVialDose(penDose);
  };
  // Trocar o local volta ao lado sugerido para ele (o oposto do último lado usado ali); nunca bloqueia.
  const pickSite = (next: InjectionSite) => {
    if (next === site) return;
    selectionHaptic();
    setSite(next);
    setSide(suggestedSide(state.injections, next, today));
  };
  const pickSide = (next: InjectionSide) => {
    if (next !== side) selectionHaptic();
    setSide(next);
  };
  const openForm = () => {
    setView("form");
    scroller.current?.scrollTo({ y: 0, animated: false });
    if (!isPen) setFrascoOpen(true);
    setFocusTarget(isPen ? "dose" : "frasco");
  };
  const leave = () => {
    openInjection(null);
    router.replace("/diario");
  };
  const formDose: ConfirmDose | null =
    canSave && doseValue !== null
      ? { method, medication: medLabel(medKey), concentration, syringe, units, doseMg: doseValue }
      : null;
  const formInput = () => ({
    id: editing?.id ?? uid(),
    userId: state.userId,
    now: new Date().toISOString(),
    today,
    createdAt: editing?.createdAt,
    date: day,
    time,
    method,
    medication: medLabel(medKey),
    units: isPen ? null : units,
    concentration: isPen ? null : concentration,
    syringe: isPen ? null : syringe,
    doseMg: isPen ? penDose : null,
    site,
    side,
    notes,
  });
  /** Registro novo pela folha de confirmação: fica na Seringa e abre "Aplicação registrada" (sem aviso). */
  const registered = (entry: InjectionEntry | null) => {
    if (!entry) return;
    setConfirm(null);
    setSaved(entry);
  };
  const confirmForm = async (when: InjectionWhen) => {
    registered(await save({ ...formInput(), ...when }, { editing: false, quiet: true }));
  };
  const confirmRecipe = async (when: InjectionWhen) => {
    if (seed.recipe) registered(await save(recipeInput(seed.recipe, when, state.userId), { editing: false, quiet: true }));
  };
  const focusRecent = () => {
    const focus = () => focusNode(recentHeading.current as unknown as View | null);
    requestAnimationFrame(focus);
    later(focus, SHEET_FADE_MS);
  };
  const goToDiary = (date: string) => {
    setDate(date);
    openInjection(null);
    router.replace("/diario");
  };

  const warningDay = isFormView ? day : today;
  const recentWarning = editing || isWarningDismissed ? null : recentInjectionWarning(state.injections, warningDay, perMonth);
  const rotation = rotationModel(state.injections, today);
  // Próxima aplicação (conceito 10): estimada só para quem acompanha a frequência; nunca uma dose.
  const nextApp = nextApplicationModel(p, state.injections, today, planReminders(state));
  const estimate = nextApp?.variant === "estimate" && nextApp.next ? nextApp.next : null;
  const stripNext =
    nextApp && estimate && estimate.daysUntil >= 0
      ? { date: estimate.date, spot: { site: nextApp.suggestedSite, side: nextApp.suggestedSide } }
      : null;
  const siteHint = summary.last
    ? `Última aplicação ${daysAgoLabel(summary.daysSinceLast)} · ${spotLabel(summary.last.site, summary.last.side ?? null)}.`
    : "Ainda não há aplicações registradas.";
  const band = rulerMg !== null ? doseBand(medKey, rulerMg) : null;
  // Estoque (SERINGA-12) e "Para os próximos dias" (SERINGA-11): modelos compartilhados, nada sugerido.
  const stock = state.treatmentStock ? stockModel(state.treatmentStock, state.injections, p, today) : null;
  const cycle = cycleCard({ profile: p, injections: state.injections, diary: state.diary, today });
  /** Rótulo conferido pela pessoa (INJECAO-X2): só aqui a concentração lida entra na calculadora. */
  const applyLabelConcentration = (value: number) => {
    changeConcentration(value);
    setLabelOpen(false);
    setFrascoOpen(true);
    notify(`Concentração do frasco: ${fmtConcentration(clampConcentration(value))}, conferida no rótulo.`, "success");
    later(() => setFocusTarget("frasco"), SHEET_FADE_MS);
  };
  const typeConcentration = () => {
    setLabelOpen(false);
    setFrascoOpen(true);
    later(() => setFocusTarget("frasco"), SHEET_FADE_MS);
  };
  const labelAction =
    aiReady && p.consentAi && !isPen ? (
      <Button label="Ler rótulo por foto" icon={ScanLine} variant="secondary" onPress={() => setLabelOpen(true)} />
    ) : undefined;
  const notifyOverflow = () => {
    if (overflowText) notify(overflowText, "warning");
  };

  const warning = recentWarning && (
    <Notice tone="attention">
      <View style={styles.warn}>
        <Info size={18} color={colors.amber700} />
        <View style={styles.warnBody}>
          <AppText size={fontSize.base} color={colors.text2} lineHeight={21}>
            {recentInjectionText(recentWarning, today)}
          </AppText>
          <View style={styles.warnActions}>
            <Button label="É outra aplicação" variant="text" onPress={() => setWarningDismissed(true)} />
            <Button label="Ver o registro" variant="text" onPress={() => openInjection(recentWarning.entry)} />
          </View>
        </View>
      </View>
    </Notice>
  );
  const history = (
    <RecentStrip
      injections={state.injections}
      today={today}
      perMonth={perMonth}
      next={stripNext}
      onSeeAll={() => router.replace("/diario")}
      headingRef={recentHeading}
    />
  );
  const guideButton = (
    <IconButton icon={Info} variant="header" accessibilityLabel="Guia rápido e segurança" onPress={() => setGuideOpen(true)} />
  );

  return (
    <Screen header={{ variant: "default", title: editing ? "Editar aplicação" : "Seringa e dose", actions: guideButton }} scroll={false}>
      <ScrollView ref={scroller} style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!isFormView && seed.recipe ? (
          <>
            {/* O aviso de aplicação recente fica na folha de confirmação (recalculado pela data), como no web. */}
            {nextApp && <NextApplicationCard model={nextApp} />}
            <RecipeHero
              recipe={seed.recipe}
              today={today}
              isDue={estimate?.isDue ?? false}
              onRegister={() => setConfirm("recipe")}
              onOther={openForm}
            />
            <RotationCard view={rotationCallouts(state.injections, today)} />
            <SafetyChecklist items={safetyItems({ method: seed.recipe.method, concentration: seed.recipe.concentrationMgPerMl })} />
          </>
        ) : (
          <>
            {seed.isStale && (
              <View style={styles.stale}>
                <Info size={18} color={colors.muted} />
                <AppText size={fontSize.sm} color={colors.text2} lineHeight={19} style={styles.grow}>
                  {STALE_RECIPE_TEXT}
                </AppText>
              </View>
            )}
            <MethodPicker value={method} onChange={pickMethod} />
            <DoseCard
              isPen={isPen}
              medKey={medKey}
              medLabel={medLabel}
              onMedication={pickMedication}
              concentration={concentration}
              onConcentration={changeConcentration}
              isFrascoOpen={isFrascoOpen}
              onFrascoToggle={() => setFrascoOpen(!isFrascoOpen)}
              frascoToggleRef={frascoToggle}
              doseValue={doseValue}
              isPresetOn={isPresetOn}
              nearestMark={isPen ? null : nearestMarkText(targetMg, units, concentration)}
              onDose={(mg) => {
                selectionHaptic();
                setDose(mg);
              }}
              onInvalidDose={() => notify("Confira a dose em mg.", "warning")}
              onStep={isPen ? null : stepDose}
              canStep={units !== null || isOverflow}
              canDecrease={(units !== null && units > 1) || isOverflow}
              overflowText={overflowText}
              ruler={ruler}
              aboveText={band?.text ?? ""}
              customNote={medKey === "personalizado" && band ? band.text : null}
              doseButtonRef={doseButton}
              labelAction={labelAction}
            />
            {!isPen && (
              <SyringeCard
                syringe={syringe}
                onSyringe={pickSyringe}
                units={units}
                isOverflow={isOverflow}
                announcement={announcement}
                onUnits={setManualUnits}
                onBlocked={notifyOverflow}
              />
            )}
            <SiteCard
              site={site}
              side={side}
              suggestedSite={summary.suggestedSite}
              suggestedSide={suggestedSide(state.injections, site, today)}
              model={rotation}
              onSite={pickSite}
              onSide={pickSide}
              hint={siteHint}
            />
            <Card>
              <WhenRow day={day} time={time} onDay={setDay} onTime={setTime} />
              <NoteRow notes={notes} onNotes={setNotes} />
            </Card>
            {warning}
            {editing && <Button label="Cancelar edição" variant="text" onPress={leave} style={styles.center} />}
          </>
        )}
        {/* Sinal do app para quem usa caneta (comer pouco, enjoo); fora da edição de um registro. */}
        {!editing && <ScreenSignal screen="seringa" />}
        {stock && <StockRow model={stock} onEdit={() => setStockMode("edit")} />}
        {history}
      </ScrollView>
      {isFormView && (
        <InjectionBar
          isPen={isPen}
          isEditing={Boolean(editing)}
          doseValue={doseValue}
          units={isPen ? null : units}
          isOverflow={isOverflow}
          isBusy={isBusy}
          onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
          onBlocked={(reason) =>
            notify(reason === "overflow" && overflowText ? overflowText : "Informe a dose prescrita antes de registrar.", "warning")
          }
          onPress={() => (editing ? void save(formInput(), { editing: true }) : setConfirm("form"))}
        />
      )}
      <ConfirmDoseSheet
        visible={confirm !== null}
        dose={confirm === "recipe" ? (seed.recipe ? recipeDose(seed.recipe) : null) : formDose}
        editable={confirm === "recipe"}
        site={site}
        side={confirm === "recipe" ? undefined : side}
        suggestedSite={confirm === "recipe" && seed.recipe ? seed.recipe.site : site}
        date={day}
        time={time}
        injections={state.injections}
        perMonth={perMonth}
        isBusy={isBusy}
        onConfirm={(when) => void (confirm === "recipe" ? confirmRecipe(when) : confirmForm(when))}
        onClose={() => setConfirm(null)}
      />
      <SavedSheet
        model={saved ? savedSheetModel(p, state.injections, saved, today) : null}
        nextSpot={{ site: summary.suggestedSite, side: summary.suggestedSide }}
        cycle={cycle}
        stock={stock}
        onDiary={() => {
          if (!saved) return;
          setSaved(null);
          goToDiary(saved.date);
        }}
        onMood={() => {
          setSaved(null);
          setMoodOpen(true);
        }}
        onMeasures={() => {
          setSaved(null);
          setMeasuresOpen(true);
        }}
        onUndo={() => {
          if (saved) undo(saved);
          setSaved(null);
        }}
        onClose={() => {
          setSaved(null);
          focusRecent();
        }}
      />
      <Sheet visible={isMoodOpen} title="Registrar bem-estar" onClose={() => setMoodOpen(false)}>
        {isMoodOpen && <QuickEntryForm type="bem_estar" onDone={() => setMoodOpen(false)} />}
      </Sheet>
      <MeasurementSheet visible={isMeasuresOpen} onClose={() => setMeasuresOpen(false)} />
      <GuideSheet visible={isGuideOpen} onClose={() => setGuideOpen(false)} />
      <LabelReadSheet
        visible={isLabelOpen}
        medKey={medKey}
        onConfirm={applyLabelConcentration}
        onManual={typeConcentration}
        onClose={typeConcentration}
      />
      <StockSheet mode={stockMode} onClose={() => setStockMode(null)} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  fill: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  center: { alignSelf: "center" },
  stale: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  warn: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  warnBody: { flex: 1, gap: 2 },
  warnActions: { flexDirection: "row", flexWrap: "wrap", columnGap: 12 },
}));
