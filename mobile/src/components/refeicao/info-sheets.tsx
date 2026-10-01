import { Linking, View } from "react-native";
import { fmtNumber, plural } from "@shared/lib/format";
import { AppText, Button, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

const TACO_URL = "https://nepa.unicamp.br/categoria/taco/";

type MergeProps = {
  /** Nome do prato a carregar; sem prato, a folha fica fechada. */
  title: string | null;
  count: number;
  /** Com foto anexada, avisa que ela fica (carregar um prato nunca tira a foto). */
  hasPhoto: boolean;
  onMerge: () => void;
  onReplace: () => void;
  onClose: () => void;
};

/** "Juntar ou substituir?": carregar um prato quando o prato atual já tem itens. */
export function MergeSheet({ title, count, hasPhoto, onMerge, onReplace, onClose }: MergeProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Sheet visible={title !== null} title="Juntar ou substituir?" onClose={onClose}>
      <AppText size={fontSize.base} lineHeight={22} color={colors.text2}>
        {`Seu prato já tem ${plural(count, "item", "itens")}. Quer juntar “${title}” ao que já está no prato ou substituir os itens?`}
        {hasPhoto ? " A foto anexada continua." : ""}
      </AppText>
      <View style={styles.actions}>
        <Button label="Juntar aos itens" onPress={onMerge} />
        <Button label="Substituir itens" variant="secondary" onPress={onReplace} />
      </View>
    </Sheet>
  );
}

/** "De onde vêm os valores": a TACO e o caráter aproximado das medidas caseiras. */
export function TacoInfoSheet({ visible, total, onClose }: { visible: boolean; total: number; onClose: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Sheet visible={visible} title="De onde vêm os valores" onClose={onClose}>
      <AppText size={fontSize.base} lineHeight={22} color={colors.text2}>
        {fmtNumber(total)} alimentos da{" "}
        <AppText
          size={fontSize.base}
          weight={700}
          lineHeight={22}
          color={colors.green700}
          accessibilityRole="link"
          // Sem navegador no aparelho: nada a fazer (o nome da fonte continua na folha), sem rejeição solta.
          onPress={() => void Linking.openURL(TACO_URL).catch(() => undefined)}
          style={styles.link}
        >
          TACO · NEPA/UNICAMP, 4ª edição (2011)
        </AppText>
        , com a composição por 100 g.
      </AppText>
      <AppText size={fontSize.xs} lineHeight={19} color={colors.muted}>
        As medidas caseiras (colher, concha, unidade) são aproximadas. Quando puder, confira na
        balança e ajuste os gramas.
      </AppText>
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  link: { textDecorationLine: "underline" },
}));
