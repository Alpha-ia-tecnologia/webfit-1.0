import { createContext, useContext, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { OptionalTag } from "./optional-tag";

/**
 * Tamanho do título das perguntas. Na página da anamnese (conceito 07) a pergunta é o título: 24 px
 * ("page") e 28 px na 1ª da etapa ("lead"); "compact" dentro do bloco "Caneta e dose". Fora da
 * página ("base"), o rótulo de 15 px de antes.
 */
export type QuestionScale = "base" | "page" | "lead" | "compact";
const QuestionScaleContext = createContext<QuestionScale>("base");
export const QuestionScaleProvider = QuestionScaleContext.Provider;
export const useQuestionScale = () => useContext(QuestionScaleContext);

type LabelSpec = { size: number; lineHeight: number; weight: 700 | 800; tracking: number };
const LABEL: Record<QuestionScale, LabelSpec> = {
  base: { size: fontSize.md, lineHeight: 20, weight: 700, tracking: -0.01 },
  page: { size: fontSize["2xl"], lineHeight: 27, weight: 800, tracking: -0.025 },
  lead: { size: fontSize["3xl"], lineHeight: 30, weight: 800, tracking: -0.03 },
  compact: { size: fontSize.lg, lineHeight: 22, weight: 800, tracking: -0.01 },
};
/** Opcional recolhido (.q-collapsed): 13 px fora da página, 17 px nela. */
const COLLAPSED_BASE: LabelSpec = { size: fontSize.sm, lineHeight: 18, weight: 700, tracking: -0.01 };

type Props = {
  label: string;
  /** Pergunta exibida no lugar do rótulo ("Tem algum diagnóstico de saúde?"). */
  prompt?: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  /** Conteúdo à direita do rótulo (valor atual, botão "Não informar"). */
  right?: ReactNode;
  /** Linha de ajuda sob o título (escolhas): "Marque todos que se aplicam · ⓘ Por quê?". Empilha o cabeçalho. */
  help?: ReactNode;
  /** Painel do "Por quê?" logo abaixo do cabeçalho. */
  panel?: ReactNode;
  /** Na página, 12 px a mais sob o cabeçalho empilhado (pílulas); os cartões de rádio ficam só com o respiro. */
  hasHeadMargin?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Título da pergunta (.q-label) com a etiqueta "Opcional" ao lado, quando for o caso. Com `prompt`, a
 * pergunta aparece e o rótulo completo segue no nome acessível (como o sufixo sr-only do web).
 */
export function QLabel({
  label,
  prompt,
  optional,
  isCollapsed = false,
}: {
  label: string;
  prompt?: string;
  optional?: boolean;
  /** Opcional recolhido numa linha de 56 px (.q-collapsed). */
  isCollapsed?: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const scale = useQuestionScale();
  const spec = isCollapsed ? (scale === "base" ? COLLAPSED_BASE : LABEL.compact) : LABEL[scale];
  const shown = prompt ?? label;
  return (
    <View style={styles.label}>
      <AppText
        heading
        size={spec.size}
        weight={spec.weight}
        lineHeight={spec.lineHeight}
        tracking={spec.tracking}
        color={colors.text}
        style={styles.labelText}
        accessibilityLabel={shown === label ? undefined : `${shown} (${label})`}
      >
        {shown}
      </AppText>
      {optional ? <OptionalTag /> : null}
    </View>
  );
}

/** .q-help: texto curto e, na 1ª pergunta da etapa, "· ⓘ Por quê?". */
export function QHelpLine({ text, about }: { text: string; about?: ReactNode }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.helpLine}>
      <AppText size={fontSize.base} lineHeight={20} color={colors.muted}>
        {text}
      </AppText>
      {about ? (
        <>
          <AppText size={fontSize.base} lineHeight={20} color={colors.muted} aria-hidden importantForAccessibility="no">
            ·
          </AppText>
          {about}
        </>
      ) : null}
    </View>
  );
}

/** Mensagem de ajuda ou erro sob a pergunta (.hint / .field-error). */
export function QHelp({ hint, error }: { hint?: string; error?: string }) {
  const colors = useThemeColors();
  if (error)
    return (
      <AppText size={fontSize.xs} color={colors.rose600} accessibilityRole="alert">
        {error}
      </AppText>
    );
  return hint ? (
    <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
      {hint}
    </AppText>
  ) : null;
}

/** Bloco de pergunta (.q-block): título, linha de ajuda, área do controle e mensagem de ajuda ou erro. */
export function QBlock({ label, prompt, optional, hint, error, right, help, panel, hasHeadMargin = true, children, style }: Props) {
  const styles = useStyles();
  const isPage = useQuestionScale() !== "base";
  return (
    <View style={[styles.block, isPage && styles.blockPage, style]} accessible={false}>
      {help ? (
        <View style={[styles.stacked, isPage && hasHeadMargin && styles.stackedPage]}>
          <QLabel label={label} prompt={prompt} optional={optional} />
          {help}
        </View>
      ) : (
        <View style={styles.head}>
          <QLabel label={label} prompt={prompt} optional={optional} />
          {/* .q-mode / .q-value: não quebram linha; quem cede espaço é o rótulo. */}
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      )}
      {panel}
      {children}
      <QHelp hint={hint} error={error} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  block: { gap: 10 },
  blockPage: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  // .q-head.is-stacked: título em cima, ajuda embaixo; na página, mais 12 px até as opções.
  stacked: { gap: 6 },
  stackedPage: { marginBottom: 12 },
  label: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 4, flexShrink: 1, minWidth: 0 },
  labelText: { flexShrink: 1 },
  right: { flexShrink: 0 },
  helpLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 2 },
}));
