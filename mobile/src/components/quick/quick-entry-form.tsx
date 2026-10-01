import { useState } from "react";
import { View } from "react-native";
import { localDate, localTime, uid } from "@shared/lib/domain";
import { visibleTags } from "@shared/lib/symptoms";
import { shouldShowTreatment } from "@shared/lib/treatment";
import { diarySchema, type DiaryEntry, type Symptom } from "@shared/types";
import { AppText, Button, Field, TextField } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { WaterAmount } from "./water-amount";
import { SymptomPicker } from "./symptom-picker";
import { MoodPicker, SleepChips, TagChips } from "./wellbeing-fields";
import { WhenRow } from "./when-row";

type Props = { type: "agua" | "bem_estar"; onDone: () => void; entry?: DiaryEntry };

/** "7,5" e "7.5" viram 7,5 h; vazio fica sem sono informado. */
const parseHours = (text: string) => (text === "" ? undefined : Number(text.replace(",", ".")));

/**
 * Folhas de água e de bem-estar (HOJE-03, HOJE-07): número grande com ±50 ml, rostos de 48 px,
 * sono em chips e marcadores; data e horário ficam em "Hoje · agora ▸ alterar". Grava no diário
 * com o mesmo esquema do web.
 */
export function QuickEntryForm({ type, onDone, entry }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, date, commit } = useApp();
  const [day, setDay] = useState(entry?.date ?? date);
  const [time, setTime] = useState(entry?.time ?? localTime());
  const [isTimeTouched, setTimeTouched] = useState(Boolean(entry));
  const [amount, setAmount] = useState(String(entry?.amountMl ?? 250));
  const [rating, setRating] = useState(entry?.rating ?? 3);
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [symptoms, setSymptoms] = useState<Symptom[]>(entry?.symptoms ?? []);
  // Efeitos percebidos (SERINGA-07): com tratamento no perfil ou num registro que já os tem.
  const showsSymptoms =
    (state.profile !== null && shouldShowTreatment(state.profile, state.injections)) ||
    (entry?.symptoms?.length ?? 0) > 0;
  const [description, setDescription] = useState(entry?.description ?? "");
  const [sleep, setSleep] = useState(entry?.sleepHours?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    const now = new Date().toISOString();
    const result = diarySchema.safeParse({
      id: entry?.id ?? uid(),
      userId: state.userId,
      date: day,
      time,
      createdAt: entry?.createdAt ?? now,
      updatedAt: now,
      type,
      title: type === "agua" ? "Água" : "Bem-estar",
      description,
      ...(type === "agua"
        ? { amountMl: Number(amount) }
        : {
            rating,
            sleepHours: parseHours(sleep),
            tags: tags.length ? tags : undefined,
            symptoms: symptoms.length ? symptoms : undefined,
          }),
    });
    if (!result.success || day > localDate()) {
      setError("Confira a data e os valores informados.");
      return;
    }
    setBusy(true);
    const ok = await commit(
      (s) => ({ ...s, diary: [...s.diary.filter((d) => d.id !== result.data.id), result.data] }),
      "Registro salvo.",
    );
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <View style={styles.form}>
      {type === "agua" ? (
        <WaterAmount value={amount} onChange={setAmount} />
      ) : (
        <>
          <MoodPicker value={rating} onChange={setRating} />
          {showsSymptoms && <SymptomPicker value={symptoms} onChange={setSymptoms} />}
          <SleepChips value={sleep} onChange={setSleep} />
          <TagChips tags={tags} onChange={setTags} options={visibleTags(showsSymptoms, tags)} />
        </>
      )}
      <Field label="Observações (opcional)">
        <TextField multiline maxLength={2000} value={description} onChangeText={setDescription} accessibilityLabel="Observações" />
      </Field>
      <WhenRow
        day={day}
        time={time}
        isNow={!isTimeTouched && day === localDate()}
        onDay={setDay}
        onTime={(next) => {
          setTimeTouched(true);
          setTime(next);
        }}
      />
      {error ? (
        <AppText size={fontSize.xs} color={colors.rose600} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label={busy ? "Salvando…" : "Salvar registro"} busy={busy} onPress={() => void save()} wide />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  form: { gap: 18 },
}));
