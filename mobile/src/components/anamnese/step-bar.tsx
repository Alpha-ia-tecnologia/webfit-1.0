import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, CloudAlert, CloudCheck } from "lucide-react-native";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, horizontal, radius, shadows, themeDomainTone } from "@/theme/tokens";

export type SaveStatus = "" | "saved" | "failed";

/** Só em tela muito estreita o selo "Salvo" vira o ícone (o nome acessível continua). */
const TINY_MAX_WIDTH = 340;

type Props = {
  step: number;
  total: number;
  /** Nome da etapa: aparece depois de "Etapa N de 8" (o título da página fica para leitores de tela). */
  title: string;
  /** Nome curto na barra ("Seu plano"); o anúncio do progresso continua com o título. */
  short?: string;
  /** Respostas essenciais da etapa atual: preenchem o segmento dela. */
  answered: number;
  required: number;
  saveStatus: SaveStatus;
  backLabel: string;
  isBackDisabled: boolean;
  onBack: () => void;
  /** Texto no lugar de "Etapa X de Y" (editor de uma seção: "Editar seção"). */
  label?: string;
  /** Sem a barra de etapas (editor de uma seção só). */
  hideProgress?: boolean;
};

/**
 * Barra única da anamnese (StepBar do web, conceito 07): voltar, "Etapa 3 de 8 · Histórico de saúde"
 * e o selo "Salvo", com um segmento por etapa. As etapas feitas ficam verdes; a atual enche em
 * degradê verde → azul conforme as respostas essenciais.
 */
export function StepBar({
  step,
  total,
  title,
  short,
  answered,
  required,
  saveStatus,
  backLabel,
  isBackDisabled,
  onBack,
  label,
  hideProgress = false,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const current = required ? answered / required : 1;
  const fillOf = (index: number) => (index < step ? 1 : index === step ? current : 0);
  const essentials = required ? `, ${answered} de ${required} respostas essenciais` : "";
  return (
    <>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          accessibilityState={{ disabled: isBackDisabled }}
          disabled={isBackDisabled}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed, isBackDisabled && styles.disabled]}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.center}>
          <AppText heading size={fontSize.base} weight={800} color={colors.text} style={styles.strong} testID="anamnese-bar-text">
            {label ?? `Etapa ${step + 1} de ${total}`}
          </AppText>
          {/* O nome da etapa já é o título da página: aqui só se desenha, sem repetir para o leitor de tela. */}
          <AppText
            size={fontSize.base}
            color={colors.muted}
            numberOfLines={1}
            style={styles.title}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {`· ${short ?? title}`}
          </AppText>
        </View>
        <View accessibilityLiveRegion="polite" aria-live="polite">
          {saveStatus ? <SavedChip failed={saveStatus === "failed"} /> : null}
        </View>
      </View>
      {hideProgress ? null : (
        <View
          style={styles.steps}
          role="progressbar"
          aria-label="Etapas da anamnese"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          aria-valuetext={`Etapa ${step + 1} de ${total}: ${title}${essentials}`}
        >
          {Array.from({ length: total }, (_, index) => {
            const fill = fillOf(index);
            const width = `${Math.round(fill * 100)}%` as const;
            return (
              <View key={index} style={styles.segment}>
                {fill <= 0 ? null : index === step ? (
                  <LinearGradient
                    colors={[colors.green500, colors.sky500]}
                    start={horizontal.start}
                    end={horizontal.end}
                    style={[styles.segmentFill, { width }]}
                  />
                ) : (
                  <View style={[styles.segmentFill, styles.segmentDone, { width }]} />
                )}
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}

/** Selo do rascunho: "Salvo" (nuvem com check) ou "Não salvo" em tom de atenção. */
function SavedChip({ failed }: { failed: boolean }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const isTiny = useWindowDimensions().width <= TINY_MAX_WIDTH;
  const Icon = failed ? CloudAlert : CloudCheck;
  const tone = failed ? themeDomainTone(scheme).attention.fg : colors.green800;
  return (
    <View
      accessible
      // No web, role=img garante que o nome acessível seja lido mesmo quando só o ícone aparece.
      accessibilityRole={Platform.OS === "web" ? "image" : "text"}
      accessibilityLabel={failed ? "Não salvo" : "Salvo neste aparelho"}
      style={[styles.saved, failed && styles.savedFailed, isTiny && styles.savedTiny]}
    >
      <Icon size={16} color={tone} />
      {isTiny ? null : (
        <AppText heading size={fontSize.sm} weight={800} color={tone}>
          {failed ? "Não salvo" : "Salvo"}
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  // .anamnese-bar: voltar de 44, texto que cede espaço e o selo.
  bar: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.45 },
  center: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 6 },
  strong: { flexShrink: 0 },
  title: { flexShrink: 1, minWidth: 0 },
  // .anamnese-saved
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.mint50,
  },
  savedFailed: { backgroundColor: themeDomainTone(scheme).attention.bg },
  savedTiny: { paddingHorizontal: 9 },
  // .anamnese-step-progress: 8 segmentos de 6 px.
  steps: { flexDirection: "row", gap: 5, marginTop: 14 },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  segmentFill: { height: "100%", borderRadius: 999 },
  segmentDone: { backgroundColor: colors.green500 },
}));
