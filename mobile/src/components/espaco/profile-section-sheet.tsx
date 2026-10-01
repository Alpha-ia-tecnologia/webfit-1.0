import { PenLine } from "lucide-react-native";
import { View } from "react-native";
import { questionnaire } from "@shared/data/questionnaire";
import { localDate } from "@shared/lib/domain";
import { PROFILE_HUB_COPY, sectionAnswers } from "@shared/lib/profile-summary";
import { onDevice } from "@/components/anamnese/device-copy";
import { AppText, Button, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

type Props = {
  index: number;
  onClose: () => void;
  /** Fecha a folha e abre o editor só desta seção. */
  onEdit: (index: number) => void;
};

/** Respostas de uma seção da anamnese (datas "15/06/1992", opções pelo rótulo) e o atalho de edição. */
export function ProfileSectionSheet({ index, onClose, onEdit }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const section = questionnaire[index];
  if (!section || !state.profile) return null;
  const rows = sectionAnswers(state.profile, index, localDate());
  return (
    <Sheet
      visible
      title={section.title}
      onClose={onClose}
      footer={
        <Button label={PROFILE_HUB_COPY.editSection} icon={PenLine} wide onPress={() => onEdit(index)} />
      }
    >
      <View role="list" aria-label={`Respostas: ${section.title}`}>
        {rows.map((row) => (
          <View key={row.key} role="listitem" style={styles.answer}>
            <AppText size={fontSize.xs} color={colors.muted}>
              {onDevice(row.label)}
            </AppText>
            <AppText size={fontSize.sm} weight={600} lineHeight={20}>
              {row.value}
            </AppText>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  answer: {
    gap: 2,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
}));
