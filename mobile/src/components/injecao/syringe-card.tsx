import Slider from "@react-native-community/slider";
import { ShieldCheck } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, View } from "react-native";
import { SYRINGES, fmtMl, fmtNumber2, syringeProfile, volumeMl } from "@shared/lib/injection";
import type { SyringeUnits } from "@shared/types";
import { AppText, Card, Disclosure, LiveAnnouncement } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";
import { ART } from "./art-colors";
import { SyringeFigure, SyringeLens } from "./syringe-figure";
import { useWebAriaDisabled } from "./use-web-aria-disabled";

/** Seringas da menor para a maior no seletor. */
const ORDERED = [...SYRINGES].sort((a, b) => a.units - b.units);
const LENS_SYRINGE: SyringeUnits = 100;

type Props = {
  syringe: SyringeUnits;
  onSyringe: (next: SyringeUnits) => void;
  /** UI a aspirar; null sem dose ou quando a dose não cabe em 100 UI. */
  units: number | null;
  /** A dose informada não cabe em 100 UI (o herói mostra "—" sem pedir a dose de novo). */
  isOverflow: boolean;
  /** Anúncio para o leitor de tela (atalho, dose digitada, ±0,05 mg, seringa, concentração). */
  announcement: string;
  /** Ajuste manual: controle deslizante e botões de 1 e 5 UI. */
  onUnits: (units: number) => void;
  /** Toque em ±1/±5 UI enquanto a dose não cabe: o aviso do estouro (a dose prescrita não é trocada). */
  onBlocked: () => void;
};

type FineProps = {
  label: string;
  accessibilityLabel: string;
  /** Sem efeito algum (ex.: "Diminuir" sem dose). */
  disabled: boolean;
  /** Parece desativado (aria-disabled), mas o toque responde com `onBlocked`. */
  isBlocked: boolean;
  onPress: () => void;
  onBlocked: () => void;
};

function FineButton({ label, accessibilityLabel, disabled, isBlocked, onPress, onBlocked }: FineProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const button = useRef<View>(null);
  useWebAriaDisabled(button, isBlocked);
  const isInactive = disabled || isBlocked;
  return (
    <Pressable
      ref={button}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isInactive }}
      disabled={disabled}
      onPress={isBlocked ? onBlocked : onPress}
      style={({ pressed }) => [styles.fine, pressed && !isInactive && styles.pressed, isInactive && styles.disabled]}
    >
      <AppText size={fontSize.sm} weight={700} color={colors.text2}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Seringa (SERINGA-03): tipo em rádios, "Aspire até" em destaque, a figura calibrada com a lupa na de
 * 100 UI, a dica fixa "Antes de medir" e o ajuste manual recolhido.
 */
export function SyringeCard({ syringe, onSyringe, units, isOverflow, announcement, onUnits, onBlocked }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  const profile = syringeProfile(syringe);
  const isEmpty = units === null;
  const step = (delta: number) => {
    if (units === null) {
      if (delta > 0) onUnits(Math.min(delta, syringe));
      return;
    }
    onUnits(Math.min(syringe, Math.max(1, units + delta)));
  };
  // Com estouro, ±1/±5 UI trocariam a dose prescrita por 1–5 UI sem aviso: ficam bloqueados e avisam.
  const fine = (label: string, accessibilityLabel: string, delta: number) => (
    <FineButton
      label={label}
      accessibilityLabel={accessibilityLabel}
      disabled={isEmpty && !isOverflow && delta < 0}
      isBlocked={isOverflow}
      onPress={() => step(delta)}
      onBlocked={onBlocked}
    />
  );
  return (
    <Card>
      <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
        Seringa
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Tipo de seringa" style={styles.segmented}>
        {ORDERED.map((s) => {
          const isOn = s.units === syringe;
          return (
            <Pressable
              key={s.units}
              accessibilityRole="radio"
              accessibilityLabel={`Seringa de ${s.title}`}
              accessibilityState={{ checked: isOn }}
              aria-checked={isOn}
              onPress={() => onSyringe(s.units)}
              style={({ pressed }) => [styles.segment, isOn && styles.segmentOn, pressed && !isOn && styles.segmentPressed]}
            >
              <AppText size={fontSize.sm} weight={isOn ? 800 : 600} color={isOn ? colors.text : colors.muted}>
                {s.title}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.hero} testID="injection-hero">
        <AppText size={fontSize.xs} weight={700} upper tracking={0.06} color={colors.muted}>
          Aspire até
        </AppText>
        <View style={styles.heroRow}>
          <AppText heading size={fontSize["7xl"]} weight={900} tracking={-0.03} lineHeight={54} color={colors.text} style={styles.tabular}>
            {isEmpty ? "—" : units}
            {isEmpty ? null : (
              <AppText heading size={fontSize.xl} weight={800} color={tone.fg}>
                {" UI"}
              </AppText>
            )}
          </AppText>
          <AppText size={fontSize.lg} weight={600} color={colors.text2}>
            <AppText heading size={fontSize["2xl"]} weight={800} color={colors.text} testID="injection-volume" style={styles.tabular}>
              {isEmpty ? "—" : fmtNumber2(volumeMl(units))}
            </AppText>{" "}
            ml
          </AppText>
        </View>
        {isEmpty && !isOverflow && (
          <AppText size={fontSize.sm} color={colors.muted}>
            Informe a dose prescrita para ver quanto aspirar.
          </AppText>
        )}
      </View>
      <LiveAnnouncement message={announcement} />

      <View style={styles.viewport}>
        <SyringeFigure profile={profile} units={units} />
        {syringe === LENS_SYRINGE && units !== null && <SyringeLens profile={profile} units={units} />}
        <AppText size={fontSize.xs} color={ART.muted} align="center">
          Leia na borda do êmbolo · imagem ilustrativa
        </AppText>
      </View>

      <View style={styles.tip}>
        <View style={styles.tipIcon}>
          <ShieldCheck size={18} color={colors.green700} />
        </View>
        <View style={styles.grow}>
          <AppText heading size={fontSize.sm} weight={800} color={colors.green700} accessibilityRole="header">
            Antes de medir
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={19}>
            Confira o tipo da seringa antes de ler as unidades: 100 UI equivalem a 1 ml.
          </AppText>
        </View>
      </View>

      <Disclosure title="Ajuste manual">
        <Slider
          accessibilityLabel="Unidades na seringa"
          accessibilityValue={{
            min: 1,
            max: syringe,
            now: units ?? undefined,
            text: units === null ? "Sem dose" : `${units} UI, ${fmtMl(volumeMl(units))}`,
          }}
          disabled={isEmpty}
          minimumValue={1}
          maximumValue={syringe}
          step={1}
          value={units ?? 1}
          onValueChange={(value) => onUnits(Math.min(syringe, Math.max(1, Math.round(value))))}
          minimumTrackTintColor={colors.emerald}
          maximumTrackTintColor={colors.surface2}
          thumbTintColor={colors.primary}
          style={styles.slider}
        />
        <View style={styles.fineRow}>
          {fine("−5 UI", "Diminuir 5 UI", -5)}
          {fine("−1", "Diminuir 1 UI", -1)}
          {fine("+1", "Aumentar 1 UI", 1)}
          {fine("+5 UI", "Aumentar 5 UI", 5)}
        </View>
      </Disclosure>
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  grow: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },
  segmented: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  segmentOn: { backgroundColor: colors.surface, boxShadow: shadows.card },
  segmentPressed: { opacity: 0.7 },
  hero: {
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: themeDomainTone(scheme).medication.bg,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).medication.border,
  },
  heroRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", columnGap: 12 },
  viewport: {
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    // Placa da seringa (decisão 8.9): clara nos dois temas; a borda acompanha o tema.
    backgroundColor: ART.artFaint,
  },
  tip: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.mint50,
    borderWidth: 1,
    borderColor: colors.mint200,
  },
  tipIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.mint100, alignItems: "center", justifyContent: "center" },
  slider: { width: "100%", height: 44 },
  fineRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  fine: {
    minHeight: 44,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
}));
