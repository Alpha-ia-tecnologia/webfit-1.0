import { ArrowRight, ShieldCheck, Utensils } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { dietHighlights } from "@shared/lib/diet";
import type { ChatMessage } from "@shared/types";
import { AppText, Button, RichText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";

/**
 * A dieta gerada aparece no chat como resumo; o texto completo continua a um toque. Compacto (conversa, conceito 05):
 * título, "Você pediu uma nova dieta · 07:05" e as ações; "Ver resumo" abre os pontos.
 */
export function DietSummaryCard({
  message,
  isCurrent,
  hideCalories,
  hideBodyNumbers,
  onOpen,
  requestedAt = null,
  isCompact = false,
}: {
  message: ChatMessage;
  isCurrent: boolean;
  hideCalories: boolean;
  /** Números do corpo ocultos: também no resumo e no texto de dietas salvas antes da preferência. */
  hideBodyNumbers: boolean;
  onOpen: () => void;
  /** Hora do pedido ("07:05"): vira a segunda linha do cartão compacto. */
  requestedAt?: string | null;
  isCompact?: boolean;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const [isOpen, setOpen] = useState(false);
  const [isSummaryOpen, setSummaryOpen] = useState(!isCompact);
  const points = dietHighlights(message.text, hideCalories, undefined, hideBodyNumbers);
  const toggleText = isOpen ? "Mostrar resumo" : "Ver texto completo";
  // Várias dietas podem estar na conversa: o nome acessível inclui a data de cada uma.
  const createdAt = new Date(message.timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const version = isCurrent ? "Plano atual" : "Versão anterior";
  const subtitle = isCompact
    ? [requestedAt ? `Você pediu uma nova dieta · ${requestedAt}` : "", isCurrent ? "" : version].filter(Boolean).join(" · ") || version
    : version;
  return (
    <View style={[styles.card, isCompact && styles.compact]}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Utensils size={18} color={domainTone.food.fg} />
        </View>
        <View style={styles.headCopy}>
          <AppText heading size={fontSize.md} weight={700}>
            Dieta do dia criada
          </AppText>
          <AppText size={fontSize.xs} color={colors.muted}>
            {subtitle}
          </AppText>
        </View>
        {message.meta?.reviewed ? (
          <View style={styles.badge}>
            <ShieldCheck size={13} color={colors.green700} />
            <AppText size={fontSize["2xs"]} weight={700} color={colors.green700}>
              Revisada
            </AppText>
          </View>
        ) : null}
      </View>
      {isSummaryOpen && points.length > 0 && !isOpen ? (
        <View style={styles.points} accessibilityRole="list">
          {points.map((point) => (
            <View key={point} style={styles.point}>
              <View style={styles.bullet} />
              <AppText size={fontSize.sm} color={colors.text2} style={styles.pointText}>
                {point}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      {isOpen ? (
        <RichText text={message.text} hideCalories={hideCalories} hideBodyNumbers={hideBodyNumbers} size={fontSize.sm} />
      ) : null}
      <View style={styles.actions}>
        {isCurrent ? (
          <Button
            label="Abrir dieta"
            size="sm"
            iconRight={ArrowRight}
            onPress={onOpen}
          />
        ) : null}
        {isCompact ? (
          <Button
            label="Ver resumo"
            variant="text"
            expanded={isSummaryOpen}
            onPress={() => {
              setSummaryOpen(!isSummaryOpen);
              if (isSummaryOpen) setOpen(false);
            }}
          />
        ) : null}
        {!isCompact || isSummaryOpen ? (
          <Button
            label={toggleText}
            variant="text"
            expanded={isOpen}
            accessibilityLabel={`${toggleText} da dieta de ${createdAt}`}
            onPress={() => setOpen(!isOpen)}
          />
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  card: {
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderTopLeftRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.mint200,
    boxShadow: shadows.card,
  },
  /** Compacto (conversa): cartão branco de 24 px com a sombra, sem a borda menta nem o canto de bolha. */
  compact: { gap: 10, padding: 16, borderRadius: radius.lg, borderTopLeftRadius: radius.lg, borderWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: themeDomainTone(scheme).food.bg,
  },
  headCopy: { flex: 1, minWidth: 0 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.mint50,
  },
  points: { gap: 6 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: {
    width: 6,
    height: 6,
    marginTop: 8,
    marginLeft: 2,
    borderRadius: 3,
    backgroundColor: themeDomainTone(scheme).food.fg,
  },
  pointText: { flex: 1 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
}));
