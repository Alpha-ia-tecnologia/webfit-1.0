import { useEffect, useRef, useState } from "react";
import { Info, ScanLine } from "lucide-react";
import { useApp } from "../../lib/context";
import { cycleCard } from "../../lib/cycle-tips";
import { localDate, localTime } from "../../lib/domain";
import {
  STALE_RECIPE_TEXT,
  customMedicationLabel,
  fmtConcentration,
  injectionSummary,
  isPenMethod,
  isRecipeFresh,
  lastRecipe,
  medication,
  recentInjectionWarning,
  safetyItems,
  suggestedSide,
} from "../../lib/injection";
import { planReminders } from "../../lib/reminder-plan";
import { rotationCallouts, rotationModel } from "../../lib/rotation";
import { nextApplicationModel, savedSheetModel } from "../../lib/treatment";
import { stockModel } from "../../lib/treatment-stock";
import type { InjectionEntry, InjectionSide, InjectionSite } from "../../types";
import { MeasurementModal } from "../evolucao/MeasurementModal";
import { QuickEntryForm } from "../QuickEntryForm";
import { Modal, Page } from "../UI";
import {
  ConfirmDoseSheet,
  fieldsFromPlan,
  planFromRecipe,
  type DosePlan,
  type DoseWhen,
} from "./ConfirmDoseSheet";
import { DoseCard } from "./DoseCard";
import { GuideSheet } from "./GuideSheet";
import { InjectionBar } from "./InjectionBar";
import { LabelReadSheet } from "./LabelReadSheet";
import { MethodPicker } from "./MethodPicker";
import { NextApplicationCard } from "./NextApplicationCard";
import { NoteRow } from "./NoteRow";
import { RecentNotice, RecentStrip } from "./RecentInjections";
import { RecipeHero } from "./RecipeHero";
import { RotationCard } from "./RotationCard";
import { SafetyChecklist } from "./SafetyChecklist";
import { SavedSheet } from "./SavedSheet";
import { SiteCard } from "./SiteCard";
import { StockRow } from "./Stock";
import { StockSheet } from "./StockSheet";
import { SyringeCard } from "./SyringeCard";
import { seedDose, useDoseState } from "./useDoseState";
import { useInjectionSave } from "./useInjectionSave";
import { WhenRow } from "./WhenRow";
import "../anamnese/AnamneseInputs.css";
import "./Injecao.css";

type View = "recipe" | "form";
type SheetKind = "recipe" | "form";
/** Depois da folha "Aplicação registrada": bem-estar ou medidas, cada um no próprio modal. */
type FollowUp = "mood" | "measures";
const DOSE_MESSAGE = "Informe a dose prescrita antes de registrar.";

/**
 * Seringa e dose (SERINGA-01/03/05/06/08, conceito 10): com uma receita recente, a próxima aplicação
 * estimada, "Minha dose de sempre" em dois toques, o rodízio de locais, "Antes de aplicar" e a faixa
 * das últimas aplicações; senão a calculadora compacta (método, dose prescrita, seringa, local e
 * quando) com a barra fixa. Não sugere doses: registra só o que a pessoa confirmou na folha de
 * confirmação. Depois do registro, a folha "Aplicação registrada" (SERINGA-10) confirma, leva ao
 * diário e oferece bem-estar, medidas e desfazer.
 */
export function ScreenInjecao() {
  const { state, notify, navigate, setDate, editingInjection: editing, injectionView, openInjection, aiReady } =
    useApp();
  const p = state.profile!;
  const today = localDate();
  const perMonth = p.weightLossPenPerMonth;
  const summary = injectionSummary(state.injections, today);
  const rotation = rotationModel(state.injections, today);
  // Próxima aplicação (conceito 10): estimada só para quem acompanha a frequência; nunca uma dose.
  const nextApp = nextApplicationModel(p, state.injections, today, planReminders(state));
  const estimate = nextApp?.variant === "estimate" && nextApp.next ? nextApp.next : null;
  const stripNext =
    nextApp && estimate && estimate.daysUntil >= 0
      ? { date: estimate.date, spot: { site: nextApp.suggestedSite, side: nextApp.suggestedSide } }
      : null;
  // Receita lida uma vez na abertura: registrar ou desfazer não troca a tela de modo no meio do uso.
  const [start] = useState(() => {
    const latest = editing ? null : lastRecipe(state.injections, today);
    const fresh = latest && isRecipeFresh(latest, today, perMonth) ? latest : null;
    return { fresh, stale: latest && !fresh ? latest : null };
  });
  const [view, setView] = useState<View>(() =>
    editing || injectionView === "form" || !start.fresh ? "form" : "recipe",
  );
  const ctl = useDoseState(() =>
    editing
      ? seedDose(editing, true, p.weightLossPenName)
      : start.fresh
        ? seedDose(start.fresh, true, p.weightLossPenName)
        : seedDose(start.stale, false, p.weightLossPenName),
  );
  const { dose, isPen } = ctl;
  const [site, setSite] = useState<InjectionSite>(editing?.site ?? summary.suggestedSite);
  const [side, setSide] = useState<InjectionSide | null>(() =>
    editing ? (editing.side ?? null) : summary.suggestedSide,
  );
  const [day, setDay] = useState(editing?.date ?? today);
  const [time, setTime] = useState(editing?.time ?? localTime());
  const [notes, setNotes] = useState(editing?.notes ?? "");
  // "Outra dose ou frasco novo" vindo do Hoje abre a calculadora já com o frasco à vista.
  const [isFrascoOpen, setFrascoOpen] = useState(
    () => !editing && injectionView === "form" && start.fresh !== null && !isPenMethod(start.fresh.method),
  );
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const [isWarningDismissed, setWarningDismissed] = useState(false);
  const [saved, setSaved] = useState<InjectionEntry | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [isLabelOpen, setLabelOpen] = useState(false);
  const [isStockOpen, setStockOpen] = useState(false);
  const recentTitleRef = useRef<HTMLHeadingElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [pendingFocus, setPendingFocus] = useState<"frasco" | "dose" | null>(null);
  const frascoRef = useRef<HTMLButtonElement>(null);
  const doseRef = useRef<HTMLButtonElement>(null);
  const { save, undo, isBusy } = useInjectionSave();

  useEffect(() => {
    if (!pendingFocus) return;
    (pendingFocus === "frasco" ? frascoRef : doseRef).current?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const customLabel = customMedicationLabel(p.weightLossPenName);
  const medLabel = dose.medKey === "personalizado" ? customLabel : medication(dose.medKey).label;
  const recentWarning =
    editing || isWarningDismissed
      ? null
      : recentInjectionWarning(state.injections, view === "recipe" ? today : day, perMonth);
  const formPlan: DosePlan | null =
    ctl.canSave && ctl.doseValue !== null
      ? {
          method: dose.method,
          medication: medLabel,
          concentration: isPen ? null : dose.concentration,
          syringe: isPen ? null : dose.syringe,
          units: isPen ? null : dose.units,
          doseMg: ctl.doseValue,
        }
      : null;
  const recipePlan = start.fresh ? planFromRecipe(start.fresh) : null;
  const sheetPlan = sheet === "recipe" ? recipePlan : sheet === "form" ? formPlan : null;

  // Trocar o local volta o lado para o sugerido nesse local (o mapa só resume, não escolhe).
  const pickSite = (next: InjectionSite) => {
    if (next === site) return;
    setSite(next);
    setSide(suggestedSide(state.injections, next, today));
  };
  const goToForm = () => {
    setView("form");
    if (isPen) setPendingFocus("dose");
    else {
      setFrascoOpen(true);
      setPendingFocus("frasco");
    }
  };
  const leave = () => {
    openInjection(null);
    navigate("diario");
  };
  const pressBar = () => {
    if (ctl.overflowText) {
      ctl.warnOverflow();
      return;
    }
    if (!formPlan) {
      notify(DOSE_MESSAGE, "warning");
      return;
    }
    if (editing) void save(fieldsFromPlan(formPlan, { site, side, date: day, time }, notes), { editing });
    else setSheet("form");
  };
  const confirm = async (when: DoseWhen) => {
    if (!sheetPlan) return;
    const entry = await save(fieldsFromPlan(sheetPlan, when, sheet === "form" ? notes : ""), {
      editing: null,
      quiet: true,
    });
    if (!entry) return;
    setSheet(null);
    setSaved(entry);
  };
  // Fechar a folha fica na Seringa: o foco vai para "Últimas aplicações" (ou o primeiro controle).
  const closeSaved = () => {
    setSaved(null);
    requestAnimationFrame(() => {
      const target =
        recentTitleRef.current ??
        screenRef.current?.querySelector<HTMLElement>('button:not(:disabled), [tabindex="0"]');
      target?.focus();
    });
  };
  const openDiary = (entry: InjectionEntry) => {
    setSaved(null);
    setDate(entry.date);
    openInjection(null);
    navigate("diario");
  };
  const openFollowUp = (kind: FollowUp) => {
    setSaved(null);
    setFollowUp(kind);
  };
  // Rótulo por foto (INJECAO-X2): só com a IA autorizada e pronta, e só no frasco. Ao voltar, o
  // editor do frasco fica aberto e o foco vai para "Alterar a concentração do frasco".
  const backToFrasco = () => {
    setLabelOpen(false);
    setFrascoOpen(true);
    setPendingFocus("frasco");
  };
  const confirmLabel = (concentration: number) => {
    ctl.setConcentration(concentration);
    backToFrasco();
    notify(`Concentração do frasco: ${fmtConcentration(concentration)}, conferida no rótulo.`, "success");
  };
  const labelAction =
    aiReady && p.consentAi && !isPen ? (
      <button type="button" className="btn-secondary inj-label-btn" onClick={() => setLabelOpen(true)}>
        <ScanLine size={18} aria-hidden="true" />
        Ler rótulo por foto
      </button>
    ) : null;
  const stock = state.treatmentStock ? stockModel(state.treatmentStock, state.injections, p, today) : null;

  const guideButton = (
    <button type="button" className="icon-btn inj-guide-btn" aria-label="Guia rápido e segurança" onClick={() => setGuideOpen(true)}>
      <Info size={20} aria-hidden="true" />
    </button>
  );
  const recentNotice = recentWarning && (
    <RecentNotice recent={recentWarning} today={today} onDismiss={() => setWarningDismissed(true)} onOpen={openInjection} />
  );

  return (
    <Page title={editing ? "Editar aplicação" : "Seringa e dose"} header={{ actions: guideButton }}>
      <div ref={screenRef} className={`inj-screen ${view === "form" ? "inj-form" : ""}`}>
        {view === "recipe" && start.fresh ? (
          <>
            {/* O aviso de aplicação recente fica na folha de confirmação (recalculado pela data). */}
            {nextApp && <NextApplicationCard model={nextApp} />}
            <RecipeHero
              recipe={start.fresh}
              today={today}
              isDue={estimate?.isDue ?? false}
              onRegister={() => setSheet("recipe")}
              onOther={goToForm}
            />
            <RotationCard view={rotationCallouts(state.injections, today)} />
            <SafetyChecklist
              items={safetyItems({ method: start.fresh.method, concentration: start.fresh.concentrationMgPerMl })}
            />
          </>
        ) : (
          <>
            {start.stale && <p className="inj-alert neutral inj-stale">{STALE_RECIPE_TEXT}</p>}
            <MethodPicker method={dose.method} onPick={ctl.pickMethod} />
            <DoseCard
              ctl={ctl}
              customLabel={customLabel}
              isFrascoOpen={isFrascoOpen}
              onToggleFrasco={() => setFrascoOpen((v) => !v)}
              frascoRef={frascoRef}
              doseRef={doseRef}
              onInvalidDose={() => notify("Confira a dose em mg.", "warning")}
              labelAction={labelAction}
            />
            {!isPen && <SyringeCard ctl={ctl} />}
            <SiteCard
              site={site}
              side={side}
              summary={summary}
              rotation={rotation}
              suggestedSide={suggestedSide(state.injections, site, today)}
              onSite={pickSite}
              onSide={setSide}
            />
            <section className="card inj-card inj-when-card" aria-label="Quando e observação">
              <WhenRow date={day} time={time} today={today} onDate={setDay} onTime={setTime} />
              <NoteRow notes={notes} onChange={setNotes} />
            </section>
            {recentNotice}
            {editing && (
              <button type="button" className="text-btn inj-cancel-edit" onClick={leave}>
                Cancelar edição
              </button>
            )}
          </>
        )}
        {stock && <StockRow model={stock} onEdit={() => setStockOpen(true)} />}
        <RecentStrip
          injections={state.injections}
          today={today}
          perMonth={perMonth}
          next={stripNext}
          onSeeAll={() => navigate("diario")}
          headingRef={recentTitleRef}
        />
        {view === "form" && (
          <InjectionBar
            doseValue={ctl.doseValue}
            units={dose.units}
            isPen={isPen}
            isOverflow={ctl.isOverflow}
            isEditing={Boolean(editing)}
            isBusy={isBusy}
            onPress={pressBar}
          />
        )}
      </div>
      {sheet && sheetPlan && (
        <ConfirmDoseSheet
          plan={sheetPlan}
          initial={
            sheet === "recipe"
              ? start.fresh
                ? { site: start.fresh.site, side: start.fresh.side, date: today, time: localTime() }
                : { site: summary.suggestedSite, date: today, time: localTime() }
              : { site, side, date: day, time }
          }
          isEditable={sheet === "recipe"}
          suggestedSite={summary.suggestedSite}
          injections={state.injections}
          perMonth={perMonth}
          today={today}
          isBusy={isBusy}
          onConfirm={(when) => void confirm(when)}
          onClose={() => setSheet(null)}
        />
      )}
      {saved && (
        <SavedSheet
          model={savedSheetModel(p, state.injections, saved, today)}
          nextSpot={{ site: rotation.suggested.site, side: rotation.suggested.side }}
          cycle={cycleCard({ profile: p, injections: state.injections, diary: state.diary, today })}
          stock={stock}
          onDiary={() => openDiary(saved)}
          onMood={() => openFollowUp("mood")}
          onMeasures={() => openFollowUp("measures")}
          onUndo={() => {
            void undo(saved);
            closeSaved();
          }}
          onClose={closeSaved}
        />
      )}
      {followUp === "mood" && (
        <Modal title="Registrar bem-estar" onClose={() => setFollowUp(null)}>
          <QuickEntryForm type="bem_estar" onDone={() => setFollowUp(null)} />
        </Modal>
      )}
      {followUp === "measures" && <MeasurementModal onClose={() => setFollowUp(null)} />}
      {isGuideOpen && <GuideSheet onClose={() => setGuideOpen(false)} />}
      {isLabelOpen && (
        <LabelReadSheet
          medKey={dose.medKey}
          onConfirm={confirmLabel}
          onManual={backToFrasco}
          onClose={() => setLabelOpen(false)}
        />
      )}
      {isStockOpen && <StockSheet mode="edit" onClose={() => setStockOpen(false)} />}
    </Page>
  );
}
