import { Star } from "lucide-react-native";
import { View } from "react-native";
import { AppText, Button, Field, TextField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

type Props = {
  name: string;
  busy: boolean;
  isFull: boolean;
  /** Por que o favorito não foi salvo; fica no próprio formulário. */
  error?: string;
  onChangeName: (name: string) => void;
  onSave: () => void;
};

/** Guardar o prato atual em "Seus pratos" (.plate-favorite). */
export function FavoriteForm({ name, busy, isFull, error, onChangeName, onSave }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.box}>
      <Field label="Nome do prato favorito" style={styles.field}>
        <TextField
          maxLength={100}
          value={name}
          placeholder="Ex.: meu almoço de casa"
          onChangeText={onChangeName}
          onSubmitEditing={onSave}
          returnKeyType="done"
          invalid={Boolean(error)}
          accessibilityLabel="Nome do prato favorito"
        />
      </Field>
      <Button
        label={busy ? "Salvando favorito…" : "Salvar como favorito"}
        variant="secondary"
        icon={Star}
        disabled={isFull}
        busy={busy}
        onPress={() => !busy && onSave()}
      />
      {error ? (
        <AppText
          size={fontSize.xs}
          lineHeight={18}
          color={colors.rose600}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={styles.full}
        >
          {error}
        </AppText>
      ) : null}
      {isFull && (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19} style={styles.full}>
          Você chegou a 100 favoritos. Para salvar outro, remova um em Seus pratos.
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  field: { flexGrow: 1, flexShrink: 1, flexBasis: 200 },
  full: { flexBasis: "100%" },
}));
