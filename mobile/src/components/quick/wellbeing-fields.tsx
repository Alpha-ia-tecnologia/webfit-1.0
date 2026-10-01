import { useState } from "react";
import { Pressable, View } from "react-native";
import { MOOD_LABELS } from "@shared/lib/day";
import { SLEEP_CHIPS, WELLBEING_TAGS, toggleTag } from "@shared/lib/wellbeing";
import { MoodFace } from "@/components/hoje/mood-card";
import { AppText, Field, TextField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ChipGroup, EntryChip } from "./entry-chip";

const MOOD_GROUP = "Como você se sente?";
/** Rostos do seletor (HOJE-07). */
const FACE_SIZE = 48;

/** Cinco rostos de 48 px como botões de rádio; nenhum usa vermelho. */
export function MoodPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={MOOD_GROUP}>
      <AppText size={fontSize.sm} weight={600} color={colors.text2} aria-hidden importantForAccessibility="no">
        {MOOD_GROUP}
      </AppText>
      <View style={styles.faces}>
        {MOOD_LABELS.map((label, i) => {
          const isOn = value === i + 1;
          return (
            <Pressable
              key={label}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: isOn }}
              aria-checked={isOn}
              onPress={() => onChange(i + 1)}
              style={({ pressed }) => [styles.face, isOn && styles.faceOn, pressed && styles.facePressed]}
            >
              <MoodFace rating={i + 1} size={FACE_SIZE} />
              <AppText
                size={fontSize.xs}
                weight={isOn ? 700 : 600}
                color={isOn ? colors.text : colors.muted}
                align="center"
                lineHeight={15}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Sono em chips de horas cheias; "Outro valor" abre o campo para meias horas ou exceções. */
export function SleepChips({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const styles = useStyles();
  const isPreset = value === "" || SLEEP_CHIPS.some((h) => String(h) === value);
  const [isCustom, setCustom] = useState(!isPreset);
  const pick = (hours: number) => {
    setCustom(false);
    onChange(value === String(hours) && !isCustom ? "" : String(hours));
  };
  const toggleCustom = () => {
    if (isCustom) onChange("");
    setCustom(!isCustom);
  };
  return (
    <View style={styles.group}>
      <ChipGroup label="Horas de sono (opcional)" hasLegend>
        {SLEEP_CHIPS.map((hours) => (
          <EntryChip key={hours} label={`${hours} h`} isOn={!isCustom && value === String(hours)} onPress={() => pick(hours)} />
        ))}
        <EntryChip label="Outro valor" isOn={isCustom} onPress={toggleCustom} />
      </ChipGroup>
      {isCustom && (
        <Field label="Horas de sono">
          <TextField
            value={value}
            onChangeText={(text) => onChange(text.replace(/[^\d.,]/g, ""))}
            keyboardType="decimal-pad"
            accessibilityLabel="Horas de sono"
            maxLength={4}
          />
        </Field>
      )}
    </View>
  );
}

/**
 * Marcadores neutros de múltipla escolha (até 8 por registro). `options` troca a lista à vista (com os
 * efeitos percebidos, os marcadores repetidos somem: visibleTags).
 */
export function TagChips({
  tags,
  onChange,
  options = WELLBEING_TAGS,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  options?: readonly string[];
}) {
  return (
    <ChipGroup label="Marcadores (opcional)" hasLegend>
      {options.map((tag) => (
        <EntryChip key={tag} label={tag} isOn={tags.includes(tag)} onPress={() => onChange(toggleTag(tags, tag))} />
      ))}
    </ChipGroup>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { gap: 10 },
  faces: { flexDirection: "row", gap: 6 },
  face: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  faceOn: { borderColor: colors.green600, backgroundColor: colors.mint50 },
  facePressed: { transform: [{ scale: 0.94 }] },
}));
