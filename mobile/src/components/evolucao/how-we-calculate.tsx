import { View } from "react-native";
import { howWeCalculate, type InsightPrivacy } from "@shared/lib/progress-insights";
import { DOSE_OVERLAY_NOTE } from "@shared/lib/treatment";
import { AppText, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

type Props = {
  visible: boolean;
  privacy: InsightPrivacy;
  /** Com doses sobre o gráfico de peso: a nota informativa das doses fica aqui (saiu do cartão de peso). */
  hasDoses?: boolean;
  onClose: () => void;
};

/** Título da seção das doses sobre o gráfico de peso (só com aplicações registradas). */
export const DOSES_SECTION_TITLE = "Doses no gráfico";

/**
 * "Como calculamos" da Evolução (EVOL-06): uma folha para a tela toda, com as regras das médias, da
 * porcentagem da meta, dos dias com registro, da tendência, do bem-estar e de "Sua semana". O texto vem
 * de howWeCalculate (o mesmo do web): perfil calmo não vê peso nem proteína; nada fala de energia.
 */
export function HowWeCalculate({ visible, privacy, hasDoses = false, onClose }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Sheet visible={visible} title="Como calculamos" onClose={onClose}>
      {visible &&
        howWeCalculate(privacy).map((section) => (
          <View key={section.key} style={styles.section}>
            <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
              {section.title}
            </AppText>
            {section.paragraphs.map((paragraph) => (
              <AppText key={paragraph} size={fontSize.sm} color={colors.text2} lineHeight={20}>
                {paragraph}
              </AppText>
            ))}
          </View>
        ))}
      {visible && hasDoses ? (
        <View style={styles.section}>
          <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
            {DOSES_SECTION_TITLE}
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
            {DOSE_OVERLAY_NOTE}
          </AppText>
        </View>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  section: { gap: 6 },
}));
