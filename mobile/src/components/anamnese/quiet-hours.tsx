import { Moon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { TIME_PRESETS } from "@shared/data/anamneseOptions";
import type { Question } from "@shared/data/questionnaire";
import { isQuietLinked } from "@shared/lib/anamnese-flow";
import type { Draft } from "@shared/types";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { QHelp } from "./q-block";
import { TimePicker } from "./time-picker";

type Props = {
  answers: Draft;
  errors: Record<string, string>;
  set: (key: string, value: string | boolean) => void;
  /** Campos da etapa: rótulos dos horários de silêncio. */
  fields: Question[];
};

/**
 * Silêncio dos lembretes (só com lembretes ligados): uma frase com o horário, que acompanha o sono
 * enquanto for igual a ele, e "Alterar" abre os dois horários.
 */
export function QuietHours({ answers, errors, set, fields }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const start = String(answers.quietStart ?? "");
  const end = String(answers.quietEnd ?? "");
  const hasError = Boolean(errors.quietStart || errors.quietEnd);
  const [isOpen, setOpen] = useState(hasError);
  const isSleep = isQuietLinked(answers) && start === answers.sleepTime && end === answers.wakeTime;
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  return (
    <View testID="quiet-hours" style={styles.root}>
      <View style={styles.row}>
        <Moon size={18} color={colors.green700} />
        <AppText size={fontSize.sm} weight={600} lineHeight={19} color={colors.text2} style={styles.text}>
          {`Silêncio dos lembretes: das ${start || "—"} às ${end || "—"}${isSleep ? ", igual ao seu sono" : ""}`}
        </AppText>
        <Button label="Alterar" variant="text" accessibilityLabel="Alterar horário de silêncio" expanded={isOpen || hasError} onPress={() => setOpen(!isOpen)} />
      </View>
      {isOpen || hasError ? (
        <View style={styles.pickers}>
          <TimePicker label={labelOf("quietStart")} error={errors.quietStart} value={start.slice(0, 5)} presets={TIME_PRESETS.quietStart ?? []} onChange={(next) => set("quietStart", next)} />
          <TimePicker label={labelOf("quietEnd")} error={errors.quietEnd} value={end.slice(0, 5)} presets={TIME_PRESETS.quietEnd ?? []} onChange={(next) => set("quietEnd", next)} />
        </View>
      ) : (
        <QHelp error={errors.quietStart || errors.quietEnd} />
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  text: { flex: 1, minWidth: 0 },
  pickers: { gap: 18 },
}));
