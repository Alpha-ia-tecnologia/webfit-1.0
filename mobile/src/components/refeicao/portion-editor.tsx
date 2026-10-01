import { Minus, Plus } from "lucide-react-native";
import { useEffect, useState, type Ref } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { fmtKcal } from "@shared/lib/format";
import {
  GRAMS_STEP,
  describePortion,
  fmtQty,
  gramsFor,
  measuresFor,
  parseGrams,
  qtyFor,
  stepQty,
  unitWord,
  type HouseholdMeasure,
  type PortionUnit,
} from "@shared/lib/household-measures";
import { MAX_ITEM_GRAMS } from "@shared/lib/meals";
import type { FoodItem } from "@shared/types";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { LinearGradient } from "expo-linear-gradient";
import { diagonalDown, fontFamily, fontSize, gradients, shadows } from "@/theme/tokens";
import { MeasureIcon } from "./measure-icon";
import { srOnly, webAttrs } from "./web-a11y";

/** "112,5": vírgula decimal, como no teclado brasileiro; porção zerada fica com o campo vazio. */
const gramsText = (grams: number) => (grams > 0 ? String(grams).replace(".", ",") : "");
/** Leitor de tela do aparelho: o React Native não tem estado "inválido" para campos. */
const INVALID_HINT = "Porção inválida: informe mais de 0 g.";
/** Largura de um algarismo a 14 px (Inter 600) e a folga do campo de gramas da linha "≈ 100 g". */
const SUB_DIGIT_PX = 9;
const SUB_FIELD_PAD = 6;

type Announcement = { text: string; count: number };

/**
 * Anuncia a porção depois de − / + ou da troca de medida (aria-live do web), nunca durante a
 * digitação dos gramas. No aparelho usa o anúncio do leitor de tela.
 */
function PortionAnnouncement({ announcement }: { announcement: Announcement }) {
  useEffect(() => {
    if (Platform.OS === "web" || !announcement.count || !announcement.text) return;
    AccessibilityInfo.announceForAccessibility(announcement.text);
  }, [announcement]);
  if (Platform.OS !== "web") return null;
  return (
    <AppText aria-live="polite" style={srOnly}>
      {announcement.text}
    </AppText>
  );
}

type Props = {
  food: FoodItem;
  grams: number;
  unit: PortionUnit;
  hideCalories: boolean;
  onChange: (grams: number, unit: PortionUnit) => void;
  /** Recebe o foco logo depois de adicionar o alimento. */
  plusRef?: Ref<View>;
};

/**
 * Porção de um alimento do prato: − / + pela medida caseira, troca de medida e gramas exatos.
 * O campo "Porção de … em gramas" existe sempre; digitar nele nunca troca a medida.
 */
export function PortionEditor({ food, grams, unit, hideCalories, onChange, plusRef }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  // Rascunho do que está sendo digitado ("12," no meio da digitação); some ao sair do campo
  // e sempre que − / + ou a medida mudam a porção.
  const [draft, setDraft] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement>({ text: "", count: 0 });
  const measures = measuresFor(food);
  const measure = measures.find((m) => m.id === unit) ?? null;
  const qty = qtyFor(grams, measure);
  const apply = (next: number, nextUnit: PortionUnit, nextMeasure: HouseholdMeasure | null) => {
    setDraft(null);
    setAnnouncement((a) => ({ text: describePortion(qtyFor(next, nextMeasure), nextMeasure), count: a.count + 1 }));
    onChange(next, nextUnit);
  };
  const step = (direction: 1 | -1) => {
    const next = measure
      ? gramsFor(stepQty(qty, direction, measure.step), measure)
      : stepQty(grams, direction, GRAMS_STEP);
    apply(Math.min(MAX_ITEM_GRAMS, next), unit, measure);
  };
  const kcal = !hideCalories && grams > 0 ? fmtKcal((food.caloriesPer100g * grams) / 100) : null;
  // Zero, vazio ou texto que não é número: o salvar recusa, e o campo já avisa.
  const isInvalid = !(grams > 0) || (draft !== null && parseGrams(draft) === null);
  const gramsInput = (isMain: boolean) => (
    <TextInput
      value={draft ?? gramsText(grams)}
      onChangeText={(text) => {
        setDraft(text);
        const value = parseGrams(text);
        if (value !== null) onChange(Math.min(MAX_ITEM_GRAMS, value), unit);
      }}
      onBlur={() => setDraft(null)}
      inputMode="decimal"
      maxLength={8}
      selectTextOnFocus
      accessibilityLabel={`Porção de ${food.name} em gramas`}
      accessibilityHint={isInvalid && Platform.OS !== "web" ? INVALID_HINT : undefined}
      {...webAttrs({ "aria-invalid": isInvalid })}
      style={[
        styles.grams,
        isMain ? styles.gramsMain : [styles.gramsSub, { width: Math.max(2, (draft ?? gramsText(grams)).length) * SUB_DIGIT_PX + SUB_FIELD_PAD }],
        isInvalid && styles.gramsInvalid,
      ]}
    />
  );
  return (
    <View style={styles.editor}>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Diminuir ${food.name}`}
          onPress={() => step(-1)}
          style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        >
          <Minus size={22} color={colors.text} />
        </Pressable>
        <View style={styles.value}>
          {measure ? (
            <AppText heading size={fontSize.lg} weight={800} align="center" lineHeight={38}>
              <AppText heading size={fontSize["4xl"]} weight={800} style={styles.tabular}>
                {fmtQty(qty)}
              </AppText>{" "}
              {unitWord(qty, measure)}
            </AppText>
          ) : (
            <View style={styles.mainGrams}>
              {gramsInput(true)}
              <AppText size={fontSize.md} weight={700} aria-hidden importantForAccessibility="no">
                g
              </AppText>
            </View>
          )}
          {measure || kcal ? (
            <View style={styles.sub}>
              {measure ? (
                <>
                  <AppText size={fontSize.base} weight={600} color={colors.muted} aria-hidden importantForAccessibility="no">
                    ≈
                  </AppText>
                  {gramsInput(false)}
                  <AppText size={fontSize.base} weight={600} color={colors.muted} aria-hidden importantForAccessibility="no">
                    g
                  </AppText>
                </>
              ) : null}
              {measure && kcal ? (
                <AppText size={fontSize.base} weight={600} color={colors.muted} aria-hidden importantForAccessibility="no">
                  ·
                </AppText>
              ) : null}
              {kcal ? (
                <AppText size={fontSize.base} weight={600} color={colors.muted} style={styles.tabular}>
                  {kcal}
                </AppText>
              ) : null}
            </View>
          ) : null}
          <PortionAnnouncement announcement={announcement} />
        </View>
        <Pressable
          ref={plusRef}
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${food.name}`}
          onPress={() => step(1)}
          style={({ pressed }) => [styles.step, styles.plus, pressed && styles.pressed]}
        >
          <LinearGradient colors={gradients.button} start={diagonalDown.start} end={diagonalDown.end} style={styles.plusFill} />
          {/* O ícone numa View própria: no web, a camada absoluta do gradiente pintaria por cima de um svg solto. */}
          <View>
            <Plus size={22} color={colors.white} />
          </View>
        </Pressable>
      </View>
      {measures.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.unitsScroll}
          contentContainerStyle={styles.units}
          testID="portion-units"
          role="group"
          aria-label={`Medida de ${food.name}`}
        >
          {[...measures, null].map((m) => {
            const id: PortionUnit = m?.id ?? "g";
            const label = m?.label ?? "Gramas";
            const isOn = unit === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: isOn }}
                {...webAttrs({ "aria-pressed": isOn })}
                onPress={() => apply(grams, id, m)}
                style={({ pressed }) => [styles.unit, isOn && styles.unitOn, pressed && styles.pressed]}
              >
                <MeasureIcon unit={id} size={18} color={isOn ? colors.green700 : colors.muted} />
                <AppText size={fontSize.md} weight={700} color={isOn ? colors.green800 : colors.text2}>
                  {label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  editor: { gap: 10, marginTop: 12 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: colors.surface3,
  },
  /** "−" e "+" de 48 px: branco com sombra; o "+" no gradiente verde (conceito 02). */
  step: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  plus: { overflow: "hidden", backgroundColor: colors.accentFill, boxShadow: shadows.float },
  plusFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  pressed: { transform: [{ scale: 0.94 }] },
  value: { flex: 1, minWidth: 0, alignItems: "center" },
  mainGrams: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  sub: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
  },
  grams: {
    width: 76,
    minHeight: 36,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fontFamily(700),
    fontSize: fontSize.sm,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  gramsMain: { width: 112, minHeight: 48, fontSize: fontSize["2xl"] },
  /** Gramas em segundo plano ("≈ 100 g"): o campo parece texto, na largura do número. */
  gramsSub: {
    minHeight: 28,
    paddingVertical: 0,
    paddingHorizontal: 2,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    color: colors.muted,
    fontFamily: fontFamily(600),
    fontSize: fontSize.base,
  },
  // .portion-grams[aria-invalid="true"] do web.
  gramsInvalid: { borderColor: colors.amber500, backgroundColor: colors.amber50 },
  tabular: { fontVariant: ["tabular-nums"] },
  /** Medidas numa linha que desliza de lado (como o web), cada uma com o desenho dela. */
  unitsScroll: { flexGrow: 0 },
  units: { flexDirection: "row", gap: 8 },
  unit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitOn: { borderWidth: 2, borderColor: colors.green600, backgroundColor: colors.mint50, paddingLeft: 11, paddingRight: 15 },
}));
