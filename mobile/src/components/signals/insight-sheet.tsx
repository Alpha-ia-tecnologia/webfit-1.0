import { Flame, Info, Lightbulb, MessageCircle, Sparkles, ThumbsUp, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { AGENT_REVIEW_NOTE } from "@shared/lib/agent-presentation";
import type { InsightSheetAction, InsightSheetModel, InsightTone } from "@shared/lib/day";
import { AdjustmentRows } from "@/components/hoje/balance-explain";
import { AppText, Button, IconTile, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, type Domain } from "@/theme/tokens";

/** Ícone por tom: cuidado, reforço, agente, ajuste da meta, contexto (os mesmos do web). */
export const INSIGHT_ICONS: Record<InsightTone, LucideIcon> = {
  info: Lightbulb,
  positive: ThumbsUp,
  agent: Sparkles,
  adjust: Flame,
  neutral: Info,
};
/** Tom de domínio por tom do insight: cuidado em azul (água), reforço em verde-água (combinado), agente e ajuste em menta. */
export const INSIGHT_DOMAIN: Record<InsightTone, Domain> = {
  info: "water",
  positive: "habit",
  agent: "food",
  adjust: "food",
  neutral: "neutral",
};

type Props = {
  /** null fecha a folha (ela fica montada, como as outras folhas do app). */
  sheet: InsightSheetModel | null;
  /** Pergunta pronta, abrir a conversa ou "Como calculamos" (quem abre a folha decide o destino). */
  onAction: (action: InsightSheetAction) => void;
  /** Dispensar por 3 dias (sinais) ou o recado de hoje; sem ele, a folha não oferece dispensar. */
  onDismiss?: (key: string) => void;
  onClose: () => void;
};

/**
 * Folha de um insight (InsightSheet do web): ícone no tom, uma ou duas frases, um botão de ação e
 * "Dispensar", sobre o Sheet do app.
 */
export function InsightSheet({ sheet, onAction, onDismiss, onClose }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const action = sheet?.action;
  const dismiss = onDismiss ? sheet?.dismiss : undefined;
  const footer =
    sheet && (action || dismiss) ? (
      <View style={styles.actions}>
        {action ? (
          <Button
            label={action.label}
            icon={action.kind === "explain" ? Info : MessageCircle}
            size="lg"
            wide
            onPress={() => onAction(action)}
            testID="insight-sheet-action"
          />
        ) : null}
        {dismiss ? (
          <Button
            label={dismiss.label}
            variant="text"
            onPress={() => onDismiss?.(dismiss.key)}
            style={styles.center}
            testID="insight-sheet-dismiss"
          />
        ) : null}
      </View>
    ) : undefined;
  return (
    <Sheet visible={sheet !== null} title={sheet?.title ?? ""} onClose={onClose} footer={footer}>
      {sheet?.rows ? (
        // Ajuste da meta: as mesmas linhas de "Como calculamos", sem parágrafo; a frase fica no nome acessível.
        <View testID="insight-sheet">
          <AdjustmentRows view={sheet.rows} label={sheet.body} />
        </View>
      ) : sheet ? (
        <View style={styles.body} testID="insight-sheet">
          <IconTile tone={INSIGHT_DOMAIN[sheet.tone]} size="lg" icon={INSIGHT_ICONS[sheet.tone]} />
          <AppText size={fontSize.base} lineHeight={22} color={colors.text2} style={styles.text}>
            {sheet.body}
          </AppText>
        </View>
      ) : null}
      {sheet?.tone === "agent" ? (
        <AppText size={fontSize.xs} color={colors.muted} align="center">
          Resposta de IA · {AGENT_REVIEW_NOTE}
        </AppText>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  body: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  text: { flex: 1, minWidth: 0, paddingTop: 10 },
  actions: { gap: 6 },
  center: { alignSelf: "center" },
}));
