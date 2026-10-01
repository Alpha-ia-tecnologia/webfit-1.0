import type { RefObject } from "react";
import { View } from "react-native";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { makeStyles } from "@/theme/theme";

type Props = {
  /** Título focado pelo leitor de tela a cada nova etapa (no aparelho). */
  titleRef: RefObject<View | null>;
  title: string;
};

/**
 * Título da etapa (conceito 07): o nome já aparece na barra, então o título fica só para leitores de
 * tela e para o foco (o h2.sr-only do web). Resumo, descrição e dicas moram no painel "Por quê?".
 */
export function StageHeading({ titleRef, title }: Props) {
  const styles = useStyles();
  return (
    <View ref={titleRef} accessible accessibilityRole="header" style={styles.hidden}>
      <AppText style={srOnly}>{title}</AppText>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // Caixa de 1 × 1 recortada, fora do fluxo (nunca display:none: some da árvore de acessibilidade).
  hidden: { position: "absolute", top: 0, left: 0, width: 1, height: 1, overflow: "hidden" },
}));
