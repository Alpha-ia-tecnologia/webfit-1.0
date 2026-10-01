import { CalendarClock } from "lucide-react-native";
import { View } from "react-native";
import type { NextWeighIn } from "@shared/lib/evolution";
import type { WeighInRow } from "@shared/lib/measures";
import { AppText, Sheet, SheetNotice, type SheetNoticeValue } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { WeighInList } from "./weigh-in-list";

type Props = {
  visible: boolean;
  rows: readonly WeighInRow[];
  /** Próxima pesagem sugerida; null em perfil calmo. */
  next: NextWeighIn | null;
  canDelete: boolean;
  onDelete: (id: string) => void;
  /** "Medição excluída." com o "Desfazer": o aviso da janela principal ficaria coberto pela folha. */
  notice: SheetNoticeValue | null;
  onDismissNotice: () => void;
  onClose: () => void;
};

/**
 * Folha "Pesagens" (conceito 09): a próxima pesagem (tom de água, sem cobrança, nunca vermelho) e as pesagens do
 * período em linhas, com excluir e desfazer. Abre pelo "8 pesagens" do cartão de peso.
 */
export function WeighInsSheet({ visible, rows, next, canDelete, onDelete, notice, onDismissNotice, onClose }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  return (
    <Sheet visible={visible} title="Pesagens" onClose={onClose}>
      {next ? (
        <View style={styles.next} testID="journey-next">
          <CalendarClock size={16} color={themeDomainTone(scheme).water.fg} />
          <AppText size={fontSize.sm} weight={600} color={colors.text2} style={styles.tabular}>
            {next.label}
          </AppText>
        </View>
      ) : null}
      <SheetNotice notice={notice} onDismiss={onDismissNotice} />
      {rows.length > 0 ? (
        <WeighInList rows={[...rows]} canDelete={canDelete} onDelete={onDelete} />
      ) : (
        <AppText size={fontSize.sm} color={colors.muted}>
          Sem pesagens neste período.
        </AppText>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((_, scheme) => ({
  next: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).water.border,
    backgroundColor: themeDomainTone(scheme).water.bg,
  },
  tabular: { fontVariant: ["tabular-nums"] },
}));
