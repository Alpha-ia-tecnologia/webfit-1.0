import { LinearGradient } from "expo-linear-gradient";
import { CircleCheck } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { fmtMg, fmtMl, volumeMl } from "@shared/lib/injection";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, radius, shadows } from "@/theme/tokens";
import { useWebAriaDisabled } from "./use-web-aria-disabled";

/** Motivo de um toque no botão ainda indisponível (vira o aviso correspondente). */
export type BarBlock = "dose" | "overflow";

type Props = {
  isPen: boolean;
  isEditing: boolean;
  doseValue: number | null;
  /** UI a aspirar no frasco (null na caneta, sem dose ou quando não cabe). */
  units: number | null;
  isOverflow: boolean;
  isBusy: boolean;
  onPress: () => void;
  onBlocked: (reason: BarBlock) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
};

function barLabel({ isPen, isEditing, doseValue, units, isOverflow }: Omit<Props, "isBusy" | "onPress" | "onBlocked" | "onLayout">): string {
  if (isOverflow) return "Confira a concentração do frasco para registrar";
  if (doseValue === null || (!isPen && units === null)) return "Informe a dose para registrar";
  const mg = fmtMg(doseValue);
  if (isPen) return isEditing ? `Salvar alterações (${mg})` : `Confirmar e registrar ${mg}`;
  return isEditing ? `Salvar alterações (${units} UI, ${mg})` : `Confirmar e registrar ${units} UI (${mg})`;
}

/**
 * Barra fixa do formulário: a dose e "Registrar" (ou "Salvar"). Sem dose ou com dose que não cabe, o botão
 * fica aria-disabled mas ainda responde ao toque com o aviso do que falta (no web o `disabled` do
 * react-native-web viraria um <button disabled> sem clique, por isso o atributo vai direto no DOM).
 */
export function InjectionBar(props: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { isPen, isEditing, doseValue, units, isOverflow, isBusy } = props;
  const blocked: BarBlock | null = isOverflow ? "overflow" : doseValue === null || (!isPen && units === null) ? "dose" : null;
  const button = useRef<View>(null);
  useWebAriaDisabled(button, blocked !== null);
  const detail = doseValue === null ? null : isPen ? null : units !== null ? `${units} UI · ${fmtMl(volumeMl(units))}` : null;
  return (
    <View style={styles.bar} testID="injection-bar" onLayout={props.onLayout}>
      <View style={styles.summary}>
        <AppText heading size={fontSize["2xl"]} weight={800} style={styles.tabular} numberOfLines={1}>
          {doseValue === null ? "—" : fmtMg(doseValue)}
        </AppText>
        {detail && (
          <AppText size={fontSize.xs} weight={600} color={colors.muted} numberOfLines={1}>
            {detail}
          </AppText>
        )}
      </View>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={barLabel(props)}
        accessibilityState={{ disabled: blocked !== null, busy: isBusy }}
        aria-busy={isBusy || undefined}
        onPress={() => {
          if (isBusy) return;
          if (blocked) props.onBlocked(blocked);
          else props.onPress();
        }}
        style={({ pressed }) => [styles.button, pressed && !blocked && styles.pressed, (blocked || isBusy) && styles.inactive]}
      >
        <LinearGradient colors={gradients.button} start={horizontal.start} end={horizontal.end} style={[StyleSheet.absoluteFill, styles.gradient]} />
        <View>
          <CircleCheck size={18} color={colors.white} />
        </View>
        <AppText heading size={fontSize.md} weight={700} color={colors.white}>
          {isBusy ? "Salvando…" : isEditing ? "Salvar" : "Registrar"}
        </AppText>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glassBar,
    boxShadow: shadows.floatingBar,
  },
  summary: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    overflow: "hidden",
    boxShadow: shadows.button,
  },
  gradient: { borderRadius: radius.pill },
  pressed: { transform: [{ scale: 0.97 }] },
  inactive: { opacity: 0.55 },
}));
