import type { ReactNode } from "react";
import { View } from "react-native";
import { macroEstimate, plateGroups, type ResolvedItem } from "@shared/lib/taco-match";
import { AppText, MacroSplitBar, MiniPlate, TagPill } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";

/** Selo âmbar (nunca vermelho) de item que coincide com a alergia declarada. */
export function AllergenBadge() {
  return <TagPill label="Possível alérgeno" tone="amber" />;
}

/**
 * Um item sugerido: "{alimento} · {medida caseira}", nunca gramas. `children` acrescenta algo
 * abaixo da linha (as trocas do plano).
 */
export function PlannedItemRow({ entry, trailing, children }: { entry: ResolvedItem; trailing?: ReactNode; children?: ReactNode }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="listitem" style={styles.row}>
      <View style={styles.line}>
        <View style={styles.bullet} />
        <AppText size={fontSize.sm} lineHeight={20} color={colors.text2} style={styles.text}>
          <AppText size={fontSize.sm} weight={600} color={colors.text}>
            {entry.item.alimento}
          </AppText>
          {entry.item.medidaCaseira ? ` · ${entry.item.medidaCaseira}` : ""}
        </AppText>
        {trailing}
      </View>
      {entry.status === "allergen" ? (
        <View style={styles.badge}>
          <AllergenBadge />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Itens de uma sugestão (opção do chat, refeição do plano), com o selo de alérgeno quando couber. */
export function PlannedItems({ resolved, label }: { resolved: readonly ResolvedItem[]; label?: string }) {
  const styles = useStyles();
  return (
    <View role="list" aria-label={label} style={styles.list}>
      {resolved.map((entry, index) => (
        <PlannedItemRow key={`${index}-${entry.item.alimento}`} entry={entry} />
      ))}
    </View>
  );
}

/**
 * Estimativa de uma sugestão, sempre recalculada pela TACO: barra P/C/G com cobertura suficiente;
 * em perfil sensível, o prato com os grupos presentes no lugar dos números; senão, nada.
 */
export function PlannedEstimate({ resolved, sensitive }: { resolved: readonly ResolvedItem[]; sensitive: boolean }) {
  if (sensitive) {
    const groups = plateGroups(resolved);
    return groups.length ? <MiniPlate groups={groups} /> : null;
  }
  const { share } = macroEstimate(resolved);
  return share ? <MacroSplitBar share={share} /> : null;
}

const useStyles = makeStyles((_colors, scheme) => ({
  list: { gap: 6 },
  row: { gap: 4 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bullet: {
    width: 5,
    height: 5,
    marginTop: 8,
    borderRadius: 3,
    backgroundColor: themeDomainTone(scheme).food.fg,
  },
  text: { flex: 1, minWidth: 0 },
  badge: { paddingLeft: 13 },
}));
