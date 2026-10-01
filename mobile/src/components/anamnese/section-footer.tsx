import { View } from "react-native";
import { SECTION_EDIT_COPY } from "@shared/lib/profile-summary";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/** Espaço extra no fim da rolagem quando a prévia da meta aparece acima dos botões. */
export const SECTION_PREVIEW_SPACE = 52;

type Props = {
  /** "Sua meta passa de … por dia." (null: sem mudança, meta manual, perfil calmo ou resposta inválida). */
  preview: string | null;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
};

/**
 * Rodapé do editor de uma seção: a prévia da meta (anunciada com educação) e "Cancelar" ao lado
 * de "Salvar alterações". Nunca pede dieta nem mostra a revisão.
 */
export function SectionFooter({ preview, busy, onCancel, onSave }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.root}>
      <View accessibilityLiveRegion="polite" aria-live="polite">
        {preview ? (
          <AppText size={fontSize.sm} weight={600} color={colors.text2} lineHeight={19} role="status" testID="goal-preview">
            {preview}
          </AppText>
        ) : null}
      </View>
      <View style={styles.row}>
        <Button label={SECTION_EDIT_COPY.cancel} variant="secondary" size="lg" pill disabled={busy} onPress={onCancel} />
        <Button
          label={busy ? SECTION_EDIT_COPY.saving : SECTION_EDIT_COPY.save}
          busy={busy}
          size="lg"
          pill
          onPress={onSave}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  grow: { flex: 1 },
}));
