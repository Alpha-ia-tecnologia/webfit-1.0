import { ChevronDown, MessageSquarePlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, TextField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const NOTES_MAX = 2000;

/** "Adicionar observação": o campo fica recolhido, aberto de saída quando já há texto (edição). */
export function NoteRow({ notes, onNotes }: { notes: string; onNotes: (notes: string) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(notes.trim().length > 0);
  return (
    <View style={styles.note}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar observação"
        accessibilityState={{ expanded: isOpen }}
        aria-expanded={isOpen}
        onPress={() => setOpen(!isOpen)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <MessageSquarePlus size={16} color={colors.green700} />
        <AppText size={fontSize.sm} weight={700} color={colors.green700}>
          Adicionar observação
        </AppText>
        <View style={isOpen && styles.chevronOpen}>
          <ChevronDown size={14} color={colors.green700} />
        </View>
      </Pressable>
      {isOpen && (
        <View style={styles.field}>
          <AppText size={fontSize.sm} weight={600} color={colors.text2}>
            Observação
          </AppText>
          <TextField
            multiline
            maxLength={NOTES_MAX}
            placeholder="Ex.: lote do frasco ou como se sentiu depois"
            value={notes}
            onChangeText={onNotes}
            accessibilityLabel="Observação"
          />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  note: { gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, minHeight: 44, paddingRight: 8, borderRadius: radius.pill },
  pressed: { opacity: 0.7 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  field: { gap: 7 },
}));
