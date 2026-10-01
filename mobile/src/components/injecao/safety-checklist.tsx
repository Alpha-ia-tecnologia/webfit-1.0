import { Check, FlaskConical, Info, PenLine, RefreshCw, Syringe, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { SafetyItem, SafetyKey } from "@shared/lib/injection";
import { AppText, Card } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, shadows, themeDomainTone } from "@/theme/tokens";

const ICONS: Record<SafetyKey, LucideIcon> = {
  conc: FlaskConical,
  syringe: Syringe,
  needle: RefreshCw,
  pen: PenLine,
};
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/**
 * "Antes de aplicar" (conceito 10; SafetyChecklist do web): conferências com ícone e marcação. Só informativo:
 * tudo começa desmarcado a cada visita, nada fica salvo e nada bloqueia o registro.
 */
export function SafetyChecklist({ items }: { items: readonly SafetyItem[] }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const [checked, setChecked] = useState<ReadonlySet<SafetyKey>>(() => new Set());
  const toggle = (key: SafetyKey) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <Card style={styles.card} testID="safety-checklist">
      <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header">
        Antes de aplicar
      </AppText>
      <View role="group" aria-label="Antes de aplicar" style={styles.grid}>
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const isOn = checked.has(item.key);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isOn }}
              accessibilityLabel={`${item.title}, ${item.sub}`}
              onPress={() => toggle(item.key)}
              style={({ pressed }) => [styles.tile, isOn && styles.tileOn, pressed && styles.pressed]}
            >
              <View style={styles.icon} {...HIDDEN}>
                <Icon size={18} color={colors.text2} />
              </View>
              <View style={[styles.box, isOn && styles.boxOn]} {...HIDDEN}>
                {isOn ? <Check size={14} strokeWidth={3} color={colors.white} /> : null}
              </View>
              <AppText heading size={fontSize.base} weight={800} tracking={-0.02} lineHeight={18} {...HIDDEN}>
                {item.title}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted} lineHeight={16} style={styles.sub} {...HIDDEN}>
                {item.sub}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.note}>
        <Info size={16} color={themeDomainTone(scheme).water.fg} />
        <AppText size={fontSize.xs} color={colors.muted} style={styles.grow}>
          Informativo · siga a prescrição médica
        </AppText>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12, paddingVertical: 16, paddingHorizontal: 14 },
  // Três lado a lado; a 320 pt quebram como o auto-fit de 96 px do web.
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 96,
    minWidth: 0,
    minHeight: 80,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  tileOn: { borderColor: colors.mint200, backgroundColor: colors.mint50 },
  pressed: { opacity: 0.85 },
  icon: {
    width: 28,
    height: 28,
    marginBottom: 6,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  box: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: colors.green600, backgroundColor: colors.green600 },
  sub: { marginTop: 2 },
  note: { flexDirection: "row", alignItems: "center", gap: 6 },
  grow: { flexShrink: 1, minWidth: 0 },
}));
