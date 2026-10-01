import { GlassWater, Minus, Plus, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { toNumber } from "@shared/components/anamnese/inputs";
import { stepWater, waterModel } from "@shared/lib/goal-editor";
import type { Draft } from "@shared/types";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";
import { QHelp } from "./q-block";

/** Copos desenhados; o que passar vira "+N". */
const MAX_GLASSES = 12;
const TARGET = 44;
const DIMMED = 0.45;

type Props = {
  answers: Draft;
  error?: string;
  set: (key: string, value: string | boolean) => void;
};

/**
 * Meta de água em copos de 250 ml (.water-glasses). Sem meta, a sugestão pelo consumo habitual
 * aparece esmaecida e os botões partem dela, mas nada é gravado antes de um toque.
 */
export function WaterGlasses({ answers, error, set }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const model = waterModel(answers);
  const manual = toNumber(answers.manualWater);
  const shown = model.glasses ?? (model.suggestion ? Math.round(model.suggestion.ml / 250) : 0);
  const isSuggested = model.glasses === null && model.suggestion !== null;
  const base = manual ?? model.suggestion?.ml ?? null;
  const step = (dir: 1 | -1) => set("manualWater", String(stepWater(base, dir)));
  return (
    <View testID="water-glasses" style={styles.root}>
      <View style={styles.head}>
        <AppText heading size={fontSize.md} weight={700} color={colors.text}>
          Meta de água
        </AppText>
        <AppText heading size={fontSize.md} weight={700} color={manual === null ? colors.muted : colors.sky700}>
          {model.value}
        </AppText>
      </View>
      <View style={[styles.glasses, isSuggested && styles.dimmed]} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: Math.min(shown, MAX_GLASSES) }, (_, i) => (
          <GlassWater key={i} size={22} color={domainTone.water.fg} />
        ))}
        {shown === 0 ? <GlassWater size={22} color={domainTone.water.border} /> : null}
        {shown > MAX_GLASSES ? (
          <AppText size={fontSize.sm} weight={700} color={colors.sky700}>
            {`+${shown - MAX_GLASSES}`}
          </AppText>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <RoundButton icon={Minus} label="Menos um copo" onPress={() => step(-1)} />
        <RoundButton icon={Plus} label="Mais um copo" onPress={() => step(1)} />
        {manual !== null ? <Button label="Não informar" variant="text" onPress={() => set("manualWater", "")} /> : null}
      </View>
      {model.suggestion ? (
        <View style={styles.suggestion}>
          <Button label={model.suggestion.label} variant="secondary" size="sm" onPress={() => set("manualWater", String(model.suggestion!.ml))} />
          <AppText size={fontSize.xs} lineHeight={18} color={colors.muted}>
            {model.suggestion.hint}
          </AppText>
        </View>
      ) : null}
      {model.note ? (
        <AppText size={fontSize.xs} lineHeight={18} color={colors.text2}>
          {model.note}
        </AppText>
      ) : null}
      <QHelp error={error} />
    </View>
  );
}

function RoundButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
      <Icon size={18} color={colors.text2} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 12 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  glasses: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, minHeight: 24 },
  dimmed: { opacity: DIMMED },
  buttons: { flexDirection: "row", alignItems: "center", gap: 12 },
  round: { width: TARGET, height: TARGET, borderRadius: TARGET / 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { transform: [{ scale: 0.95 }] },
  suggestion: { gap: 4, alignItems: "flex-start" },
}));
