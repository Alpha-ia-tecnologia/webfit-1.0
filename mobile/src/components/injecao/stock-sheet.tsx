import { Minus, Plus } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { localDate } from "@shared/lib/domain";
import { STOCK_COPY, stockDefaults, stockDraft, type StockDraft } from "@shared/lib/treatment-stock";
import type { AppState, InjectionEntry, InjectionMethod, ToastAction, ToastMessage, TreatmentStock } from "@shared/types";
import { focusWithin } from "@/components/despensa/focus";
import { AppText, Button, DateField, Field, Sheet, TextField } from "@/components/ui";
import { confirmAsync } from "@/lib/confirm";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** "create": primeiro estoque; "edit": atualizar o atual; "new": frasco ou caneta nova (mesma quantidade, aberta hoje). */
export type StockSheetMode = "create" | "edit" | "new";

const TITLE = STOCK_COPY.title;
/** Nomes curtos: o seletor da Seringa usa os longos (sem conflito de nomes). */
const METHODS: readonly (readonly [InjectionMethod, string])[] = [
  ["frasco", "Frasco"],
  ["caneta", "Caneta"],
  ["dose_unica", "Dose única"],
];
const DOSES_MIN = 1;
const DOSES_MAX = 60;

type Draft = { method: InjectionMethod; volumeText: string; doses: number; openedOn: string; useBy: string | null };
type Problem = Extract<StockDraft, { ok: false }>;

const fmtVolume = (ml: number) => ml.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function initialDraft(mode: StockSheetMode, stock: TreatmentStock | null, injections: readonly InjectionEntry[], today: string): Draft {
  const defaults = stockDefaults(injections, today);
  if (mode === "create" || !stock)
    return { method: defaults.method, volumeText: "", doses: defaults.doses, openedOn: defaults.openedOn, useBy: null };
  const base = {
    method: stock.method,
    volumeText: stock.volumeMl !== null ? fmtVolume(stock.volumeMl) : "",
    doses: stock.doses ?? defaults.doses,
  };
  return mode === "edit" ? { ...base, openedOn: stock.openedOn, useBy: stock.useBy } : { ...base, openedOn: today, useBy: null };
}

function MethodRadios({ value, onChange }: { value: InjectionMethod; onChange: (method: InjectionMethod) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.field}>
      <AppText size={fontSize.sm} weight={600} color={colors.text2} aria-hidden importantForAccessibility="no">
        Tipo
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Tipo" style={styles.radios}>
        {METHODS.map(([method, label]) => {
          const isOn = method === value;
          return (
            <Pressable
              key={method}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: isOn }}
              aria-checked={isOn}
              onPress={() => onChange(method)}
              style={({ pressed }) => [styles.radio, isOn && styles.radioOn, pressed && styles.pressed]}
            >
              <AppText size={fontSize.sm} weight={isOn ? 700 : 600} color={isOn ? colors.green800 : colors.text2}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Contador de 1 a 60 com botões de 44 px (doses da caneta ou canetas na caixa). */
function CountStepper({ label, hint, value, error, onChange }: { label: string; hint: string; value: number; error?: string; onChange: (n: number) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const step = (delta: number) => onChange(Math.min(DOSES_MAX, Math.max(DOSES_MIN, value + delta)));
  return (
    <View style={styles.field} role="group" aria-label={label}>
      <AppText size={fontSize.sm} weight={600} color={colors.text2} aria-hidden importantForAccessibility="no">
        {label}
      </AppText>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Diminuir: ${label}`}
          accessibilityState={{ disabled: value <= DOSES_MIN }}
          disabled={value <= DOSES_MIN}
          onPress={() => step(-1)}
          style={({ pressed }) => [styles.round, pressed && styles.pressed, value <= DOSES_MIN && styles.disabled]}
        >
          <Minus size={18} color={colors.text2} />
        </Pressable>
        <AppText heading size={fontSize["2xl"]} weight={800} style={styles.count} testID="stock-count" accessibilityLabel={`${label}: ${value}`}>
          {value}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aumentar: ${label}`}
          accessibilityState={{ disabled: value >= DOSES_MAX }}
          disabled={value >= DOSES_MAX}
          onPress={() => step(1)}
          style={({ pressed }) => [styles.round, pressed && styles.pressed, value >= DOSES_MAX && styles.disabled]}
        >
          <Plus size={18} color={colors.text2} />
        </Pressable>
      </View>
      {error ? (
        <AppText size={fontSize.xs} color={colors.errorText} accessibilityRole="alert">
          {error}
        </AppText>
      ) : (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          {hint}
        </AppText>
      )}
    </View>
  );
}

/** Aviso dentro de uma folha que fica aberta por baixo (ex.: "Meu tratamento"): o Toast ficaria coberto por ela. */
type Say = (text: string, type: ToastMessage["type"], action?: ToastAction) => void;

function OpenStockSheet({ mode, onClose, say }: { mode: StockSheetMode; onClose: () => void; say?: Say }) {
  const styles = useStyles();
  const { state, commit: commitToast } = useApp();
  const commit = async (update: (s: AppState) => AppState, message: string, action?: ToastAction) => {
    if (!say) return commitToast(update, message, action);
    const isSaved = await commitToast(update);
    if (isSaved) say(message, "success", action);
    return isSaved;
  };
  const today = localDate();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(mode, state.treatmentStock, state.injections, today));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [isBusy, setBusy] = useState(false);
  const update = (change: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setProblem(null);
  };
  const errorFor = (field: Problem["field"]) => (problem?.field === field ? problem.message : undefined);
  const useByBox = useRef<View>(null);
  // "Limpar data de uso" some ao limpar: o foco volta ao campo "Usar até" (no aparelho, o foco do leitor de tela).
  const clearUseBy = () => {
    update({ useBy: null });
    requestAnimationFrame(() => focusWithin(useByBox.current));
  };
  const save = async () => {
    if (isBusy) return;
    const result = stockDraft({ ...draft, today });
    if (!result.ok) {
      setProblem(result);
      return;
    }
    setBusy(true);
    // O estoque que "Desfazer" devolve é lido dentro da gravação, na versão mais recente do estado.
    let previous: TreatmentStock | null = null;
    const isSaved = await commit(
      (s) => {
        previous = s.treatmentStock;
        return { ...s, treatmentStock: result.stock };
      },
      STOCK_COPY.saved,
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => ({ ...s, treatmentStock: previous }), STOCK_COPY.saveUndone(previous !== null)),
      },
    );
    setBusy(false);
    if (isSaved) onClose();
  };
  const remove = async () => {
    if (isBusy) return;
    const isConfirmed = await confirmAsync(
      STOCK_COPY.removeTitle,
      STOCK_COPY.removeMessage,
      STOCK_COPY.removeOk,
      true,
    );
    if (!isConfirmed) return;
    setBusy(true);
    let previous: TreatmentStock | null = null;
    const isSaved = await commit(
      (s) => {
        previous = s.treatmentStock;
        return { ...s, treatmentStock: null };
      },
      STOCK_COPY.removed,
      {
        label: "Desfazer",
        // Como no web: um estoque novo, informado depois de remover, não é trocado pelo antigo.
        onAction: () =>
          void commit((s) => (s.treatmentStock ? s : { ...s, treatmentStock: previous }), STOCK_COPY.restored),
      },
    );
    setBusy(false);
    if (isSaved) onClose();
  };
  const isVial = draft.method === "frasco";
  return (
    <Sheet
      visible
      title={TITLE}
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button label={isBusy ? STOCK_COPY.saving : STOCK_COPY.save} busy={isBusy} onPress={() => void save()} wide />
          {mode === "edit" && state.treatmentStock ? (
            <Button label={STOCK_COPY.remove} variant="text" tone="danger" onPress={() => void remove()} style={styles.center} />
          ) : null}
        </View>
      }
    >
      <MethodRadios value={draft.method} onChange={(method) => update({ method })} />
      {isVial ? (
        <Field label={STOCK_COPY.volumeLabel} hint={STOCK_COPY.volumeHint} error={errorFor("volumeMl")}>
          <TextField
            value={draft.volumeText}
            onChangeText={(text) => update({ volumeText: text.replace(/[^\d.,]/g, "") })}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder="Ex.: 2"
            maxLength={5}
            accessibilityLabel={STOCK_COPY.volumeLabel}
            invalid={Boolean(errorFor("volumeMl"))}
          />
        </Field>
      ) : (
        <CountStepper
          label={STOCK_COPY.dosesLabel(draft.method)}
          hint={STOCK_COPY.dosesHint(draft.method)}
          value={draft.doses}
          error={errorFor("doses")}
          onChange={(doses) => update({ doses })}
        />
      )}
      <DateField
        label={STOCK_COPY.openedLabel}
        value={draft.openedOn}
        max={today}
        hint={STOCK_COPY.openedHint}
        error={errorFor("openedOn")}
        onChange={(openedOn) => update({ openedOn })}
      />
      <View ref={useByBox}>
        <DateField
          label={STOCK_COPY.useByLabel}
          value={draft.useBy ?? ""}
          min={draft.openedOn}
          hint={STOCK_COPY.useByHint}
          error={errorFor("useBy")}
          onChange={(useBy) => update({ useBy })}
        />
      </View>
      {draft.useBy ? <Button label={STOCK_COPY.clearUseBy} variant="text" onPress={clearUseBy} style={styles.start} /> : null}
    </Sheet>
  );
}

/** Folha "Estoque do frasco ou caneta" (SERINGA-12): grava sozinha, com "Desfazer"; nada de lembretes. */
export function StockSheet({ mode, onClose, say }: { mode: StockSheetMode | null; onClose: () => void; say?: Say }) {
  return mode ? <OpenStockSheet mode={mode} onClose={onClose} say={say} /> : null;
}

const useStyles = makeStyles((colors) => ({
  field: { gap: 7 },
  radios: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  radio: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radioOn: { borderColor: colors.selectedBorder, backgroundColor: colors.chipOnTint },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  count: { minWidth: 40, textAlign: "center", fontVariant: ["tabular-nums"] },
  footer: { gap: 8 },
  center: { alignSelf: "center" },
  start: { alignSelf: "flex-start" },
}));
