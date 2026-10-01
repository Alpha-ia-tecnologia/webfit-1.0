import { Trash2 } from "lucide-react-native";
import { View } from "react-native";
import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { formatDate } from "@shared/lib/domain";
import { fmtShortDate } from "@shared/lib/format";
import type { WeighInRow } from "@shared/lib/measures";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, IconButton } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const ROW_MIN_HEIGHT = 56;
const DATE_WIDTH = 44;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

type Props = {
  rows: WeighInRow[];
  /** Com uma única medição, excluir fica indisponível (o perfil sempre tem um peso). */
  canDelete: boolean;
  onDelete: (id: string) => void;
  /** "Ocultar números do corpo" (ESPACO-13): data, método e excluir; sem peso, medidas nem variação. */
  hidden?: boolean;
};

/**
 * Pesagens em linhas (EVOL-08): bloco da data, peso, medidas do dia, método, variação em navy (nunca
 * vermelho ou verde) e excluir com alvo real de 44 px, sem tabela a rolar. Perfil calmo recebe as linhas
 * sem variação nem medidas (weighInRows).
 */
export function WeighInList({ rows, canDelete, onDelete, hidden = false }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="list" aria-label="Pesagens no período" style={styles.list}>
      {rows.map((row) => (
        <View key={row.id} role="listitem" testID="weigh-row" style={styles.row}>
          <View style={styles.date} {...HIDDEN}>
            <AppText heading size={fontSize.lg} weight={800} lineHeight={20} style={styles.tabular}>
              {row.block.day}
            </AppText>
            <AppText size={fontSize.xs} weight={600} color={colors.muted} lineHeight={14}>
              {row.block.month}
            </AppText>
          </View>
          <AppText style={srOnly}>{fmtShortDate(row.date)}</AppText>
          <View style={styles.main}>
            {hidden ? (
              <AppText heading size={fontSize.base} weight={700} color={colors.text2}>
                {BODY_PRIVACY_COPY.weighIn}
              </AppText>
            ) : (
              <>
                <AppText heading size={fontSize.base} weight={800} style={styles.tabular}>
                  {row.weight}
                </AppText>
                {row.chips.map((chip) => (
                  <View key={chip} style={styles.chip}>
                    <AppText size={fontSize.xs} weight={600} color={colors.text2}>
                      {chip}
                    </AppText>
                  </View>
                ))}
              </>
            )}
            {row.method ? (
              <AppText size={fontSize.xs} color={colors.muted} numberOfLines={1} style={styles.method}>
                {row.method}
              </AppText>
            ) : null}
          </View>
          {row.delta && !hidden && (
            <View testID="weigh-delta" style={styles.delta}>
              <AppText size={fontSize.xs} weight={800} color={colors.white} style={styles.tabular} accessibilityLabel={row.deltaLabel ?? undefined}>
                {row.delta}
              </AppText>
            </View>
          )}
          <IconButton
            icon={Trash2}
            tone="danger"
            iconSize={18}
            accessibilityLabel={`Excluir medição ${formatDate(row.date)}`}
            disabled={!canDelete}
            onPress={() => onDelete(row.id)}
          />
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  list: { gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  date: {
    width: DATE_WIDTH,
    alignItems: "center",
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
  },
  main: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 },
  chip: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  method: { flexBasis: "100%" },
  // Variação neutra (navy), como o --wf-inverse do web: no escuro, o azul-ardósia do aviso.
  delta: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.inverse },
  tabular: { fontVariant: ["tabular-nums"] },
}));
