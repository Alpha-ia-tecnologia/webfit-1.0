import { RefreshCw, ShieldCheck } from "lucide-react-native";
import { View } from "react-native";
import { visiblePlainText } from "@shared/lib/text";
import type { DietPlan } from "@shared/types";
import { AppText, Button, Card, Notice, RichText } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/** Faixa suave quando a anamnese mudou; o plano anterior continua visível abaixo. */
export function StaleBand({
  hasError,
  canGenerate,
  onGenerate,
}: {
  hasError: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  return (
    <View style={styles.stale}>
      <View style={styles.staleRow}>
        <View style={styles.staleIcon}>
          <RefreshCw size={18} color={domainTone.attention.fg} />
        </View>
        <View style={styles.staleCopy}>
          <AppText
            heading
            size={fontSize.md}
            weight={700}
            accessibilityRole="header"
          >
            Seu plano precisa ser atualizado
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2}>
            Sua anamnese mudou desde esta dieta.
          </AppText>
        </View>
      </View>
      <Button
        label={hasError ? "Tentar novamente" : "Atualizar dieta"}
        icon={RefreshCw}
        wide
        disabled={!canGenerate}
        onPress={onGenerate}
      />
    </View>
  );
}

/**
 * Plano salvo; a versão desatualizada fica tracejada e marcada como anterior. Sem esmaecer durante a
 * atualização: o AiProgress acima já sinaliza, e a opacidade derrubava o rodapé abaixo do contraste AA.
 */
export function DietPlanCard({
  plan,
  hideCalories,
  hideBodyNumbers = false,
  isStale,
}: {
  plan: DietPlan;
  hideCalories: boolean;
  /** Números do corpo ocultos (ESPACO-13): o texto salvo do plano também os esconde. */
  hideBodyNumbers?: boolean;
  isStale: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Card style={isStale ? styles.planStale : undefined}>
      {isStale ? (
        <View style={styles.tag}>
          <AppText
            size={fontSize["2xs"]}
            weight={700}
            upper
            tracking={0.06}
            color={colors.text2}
          >
            Versão anterior
          </AppText>
        </View>
      ) : null}
      {/* Plano antigo (só texto): o estruturado vai direto na tela, em linha do tempo (DietStructured). */}
      <RichText text={plan.text} hideCalories={hideCalories} hideBodyNumbers={hideBodyNumbers} selectable testID="diet-plan-text" />
      {plan.meta.notes.map((note, index) => (
        <Notice key={index}>{visiblePlainText(note, hideCalories, hideBodyNumbers)}</Notice>
      ))}
      <View style={styles.foot}>
        <ShieldCheck size={14} color={colors.green700} />
        <AppText size={fontSize.xs} color={colors.muted} style={styles.footText}>
          Apoio educativo · revisão automática, sem revisão humana
        </AppText>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  stale: {
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: themeDomainTone(scheme).attention.bg,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).attention.border,
  },
  staleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  staleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  staleCopy: { flex: 1, minWidth: 0, gap: 2 },
  planStale: {
    borderStyle: "dashed",
    borderColor: colors.slate300,
    backgroundColor: colors.surface3,
  },
  tag: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  foot: { flexDirection: "row", alignItems: "center", gap: 6 },
  footText: { flex: 1 },
}));
