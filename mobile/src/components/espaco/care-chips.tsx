import {
  Activity,
  Droplet,
  Gauge,
  HeartPulse,
  Scale,
  ShieldCheck,
  Stethoscope,
  Syringe,
  TestTube,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  CARE_BUTTON_LABEL,
  CARE_NOTES_CLOSING,
  CARE_SHEET_TITLE,
  careItemsOf,
  type CareIconKey,
  type CareItem,
} from "@shared/lib/conditions";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** Ícones dos cuidados (os nomes vêm de lib/conditions, compartilhados com o web). */
export const CARE_ICON: Record<CareIconKey, LucideIcon> = {
  heartPulse: HeartPulse,
  droplet: Droplet,
  testTube: TestTube,
  activity: Activity,
  gauge: Gauge,
  scale: Scale,
  syringe: Syringe,
  shieldCheck: ShieldCheck,
  stethoscope: Stethoscope,
};
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

const keyOf = (item: CareItem) => (item.key === "outro" ? item.text : item.key);

/**
 * Cuidados do perfil junto das metas (CareChips do web): um chip neutro por cuidado ("Pressão alta",
 * "Glicose", "Caneta"…) e o botão-texto "Cuidados"; qualquer um abre a folha "Cuidados do seu perfil"
 * (ícone, rótulo e frase curta por cuidado; o fechamento como nota de rodapé). Só texto: sem números,
 * dados do corpo ou dose; aparece também com "Ocultar calorias".
 */
export function CareChips({ notes }: { notes: readonly string[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  const items = careItemsOf(notes);
  if (!items.length) return null;
  const open = () => setOpen(true);
  return (
    <View style={styles.row} role="group" aria-label={CARE_SHEET_TITLE} testID="care-chips">
      {items.map((item) => {
        const Icon = CARE_ICON[item.icon];
        return (
          <Pressable
            key={keyOf(item)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            {...webAttrs({ "aria-haspopup": "dialog" })}
            onPress={open}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Icon size={16} color={colors.muted} />
            <AppText size={fontSize.xs} weight={600} lineHeight={16} color={colors.text2}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
      <Button label={CARE_BUTTON_LABEL} variant="text" size="sm" icon={Stethoscope} onPress={open} />
      <Sheet visible={isOpen} title={CARE_SHEET_TITLE} onClose={() => setOpen(false)}>
        <View role="list" style={styles.list}>
          {items.map((item) => {
            const Icon = CARE_ICON[item.icon];
            return (
              <View key={keyOf(item)} role="listitem" style={styles.item}>
                <View style={styles.icon} {...HIDDEN}>
                  <Icon size={16} color={colors.text2} />
                </View>
                <View style={styles.copy}>
                  <AppText size={fontSize.base} weight={700} lineHeight={18}>
                    {item.label}
                  </AppText>
                  <AppText size={fontSize.sm} lineHeight={19} color={colors.text2}>
                    {item.body}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>
        <AppText size={fontSize.xs} lineHeight={18} color={colors.muted} style={styles.closing}>
          {CARE_NOTES_CLOSING}
        </AppText>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // .care-chips: chips e "Cuidados" numa linha que quebra.
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 8 },
  // .care-chip: 32 px, raio total, tom neutro.
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  pressed: { backgroundColor: colors.surface3, transform: [{ scale: 0.97 }] },
  // Folha: .care-sheet-list / .care-sheet-icon / .care-sheet-closing.
  list: { gap: 14 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  closing: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
}));
