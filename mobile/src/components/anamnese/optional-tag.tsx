import { View } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/** Etiqueta "Opcional" ao lado do nome da pergunta (.q-optional; substitui o sufixo "(opcional)"). */
export function OptionalTag() {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.tag}>
      <AppText size={fontSize["2xs"]} weight={600} lineHeight={15} color={colors.muted}>
        Opcional
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  tag: {
    alignSelf: "center",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.surface2,
  },
}));
