import { View } from "react-native";
import { CARE_NOTES_CLOSING } from "@shared/lib/conditions";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

export const CARE_NOTES_TITLE = "Cuidados do seu perfil";

/**
 * Cuidados que acompanham as metas (condições declaradas, caneta, IMC baixo para perder peso):
 * só texto, sem números, dados do corpo ou dose (CareNotes do web). Aparece também com "Ocultar calorias".
 */
export function CareNotes({ notes }: { notes: readonly string[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  if (!notes.length) return null;
  const items = notes.filter((note) => note !== CARE_NOTES_CLOSING);
  return (
    <View style={styles.box} testID="care-notes">
      <AppText size={fontSize.sm} weight={700} accessibilityRole="header">
        {CARE_NOTES_TITLE}
      </AppText>
      {items.map((note) => (
        <View key={note} style={styles.item}>
          <AppText size={fontSize.sm} color={colors.text2} aria-hidden>
            •
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={19} style={styles.text}>
            {note}
          </AppText>
        </View>
      ))}
      {notes.includes(CARE_NOTES_CLOSING) ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          {CARE_NOTES_CLOSING}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { gap: 6, padding: 12, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  item: { flexDirection: "row", gap: 6 },
  text: { flex: 1, minWidth: 0 },
}));
