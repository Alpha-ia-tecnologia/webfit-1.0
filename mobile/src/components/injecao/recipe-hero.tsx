import { Check, History, Info, SlidersHorizontal } from "lucide-react-native";
import { Pressable, View } from "react-native";
import {
  fmtConcentration,
  fmtNumber2,
  isPenMethod,
  methodInfo,
  recipeBadge,
  recipeCta,
  recipeHeading,
  syringeProfile,
  type DoseRecipe,
} from "@shared/lib/injection";
import { AppText, Button, Card } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ART } from "./art-colors";
import { MethodArt } from "./method-art";
import { SyringeFigure } from "./syringe-figure";

const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** "50 UI / na seringa" e "0,50 ml / volume": o valor em cima, o rótulo embaixo (o dl do web). */
function Fact({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View>
      <AppText heading size={fontSize.xl} weight={800} tracking={-0.02} lineHeight={23} style={styles.tabular}>
        {value}
      </AppText>
      <AppText size={fontSize.xs} color={colors.muted}>
        {label}
      </AppText>
    </View>
  );
}

type Props = {
  recipe: DoseRecipe;
  today: string;
  /** Dia estimado da aplicação (só quem acompanha a frequência): "Registrar aplicação de hoje". */
  isDue: boolean;
  onRegister: () => void;
  onOther: () => void;
};

/**
 * "Minha dose de sempre" (SERINGA-01, conceito 10; RecipeHero do web): a última receita com a dose em destaque,
 * UI e ml, a linha da receita, a seringa com "Aspire até aqui" e o registro em dois toques (este botão →
 * confirmar). "Outra dose" abre a calculadora. Dose com 2 casas (convenção de segurança).
 */
export function RecipeHero({ recipe, today, isDue, onRegister, onOther }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isPen = isPenMethod(recipe.method);
  const vial =
    !isPen && recipe.units !== null && recipe.volumeMl !== null && recipe.syringeUnits !== null
      ? { units: recipe.units, volumeMl: recipe.volumeMl, syringeUnits: recipe.syringeUnits }
      : null;
  const line = isPen
    ? [recipe.medication, methodInfo(recipe.method).label]
    : [
        recipe.medication,
        recipe.concentrationMgPerMl !== null ? fmtConcentration(recipe.concentrationMgPerMl) : "",
        recipe.syringeUnits !== null ? `Seringa de ${recipe.syringeUnits} UI` : "",
      ].filter(Boolean);
  return (
    <Card testID="injection-recipe" style={styles.card}>
      <View style={styles.head}>
        <AppText size={fontSize.xs} weight={800} tracking={0.08} upper color={colors.green700} accessibilityRole="header" style={styles.grow}>
          {recipeHeading(recipe)}
        </AppText>
        <View style={styles.badge}>
          <History size={14} color={colors.text2} />
          <AppText size={fontSize.xs} weight={700} color={colors.text2}>
            {recipeBadge(recipe, today)}
          </AppText>
        </View>
      </View>
      <View style={styles.main}>
        <View style={styles.dose}>
          <AppText heading size={fontSize.hero} weight={800} tracking={-0.05} lineHeight={fontSize.hero} testID="injection-recipe-dose" style={styles.tabular}>
            {fmtNumber2(recipe.doseMg)}
          </AppText>
          <AppText heading size={fontSize.xl} weight={800} color={colors.green600}>
            mg
          </AppText>
        </View>
        {vial ? (
          <>
            <View style={styles.divider} {...HIDDEN} />
            <View style={styles.vial}>
              <Fact value={`${vial.units} UI`} label="na seringa" />
              <Fact value={`${fmtNumber2(vial.volumeMl)} ml`} label="volume" />
            </View>
          </>
        ) : (
          <View style={styles.art}>
            <MethodArt method={recipe.method} size={56} />
          </View>
        )}
      </View>
      <View role="list" aria-label="Receita" style={styles.line}>
        {line.map((item, i) => (
          <View key={item} role="listitem" style={styles.lineItem}>
            {i > 0 ? (
              <AppText size={fontSize.sm} color={colors.muted} {...HIDDEN}>
                {"·"}
              </AppText>
            ) : null}
            <AppText size={fontSize.sm} weight={i === 0 ? 800 : 400} color={i === 0 ? colors.text : colors.muted}>
              {item}
            </AppText>
          </View>
        ))}
      </View>
      {vial ? (
        <View style={styles.syringe}>
          <SyringeFigure profile={syringeProfile(vial.syringeUnits)} units={vial.units} tip="needle" showZero slim />
          <View style={styles.caption}>
            <Info size={14} color={ART.muted} />
            <AppText size={fontSize.xs} color={ART.muted}>
              Leia na borda do êmbolo · imagem ilustrativa
            </AppText>
          </View>
        </View>
      ) : null}
      <Button label={recipeCta(isDue)} icon={Check} size="lg" labelSize={fontSize.lg} labelWeight={800} wide onPress={onRegister} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPen ? "Outra dose" : "Outra dose ou frasco novo"}
        onPress={onOther}
        style={({ pressed }) => [styles.other, pressed && styles.pressed]}
      >
        <SlidersHorizontal size={18} color={colors.text2} />
        <AppText heading size={fontSize.base} weight={700}>
          Outra dose
        </AppText>
      </Pressable>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 10, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 6 },
  grow: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  main: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  dose: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  divider: { alignSelf: "stretch", width: 1, marginVertical: 4, backgroundColor: colors.border },
  vial: { flexDirection: "row", gap: 8 },
  art: { marginLeft: "auto" },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  lineItem: { flexDirection: "row", alignItems: "center", gap: 6, marginRight: 6 },
  // Placa da seringa (decisão 8.9): clara nos dois temas; a borda acompanha o tema.
  syringe: {
    marginTop: 2,
    marginHorizontal: -8,
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: ART.artFaint,
  },
  caption: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6 },
  other: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    minHeight: 44,
    marginTop: -6,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  pressed: { opacity: 0.7 },
}));
