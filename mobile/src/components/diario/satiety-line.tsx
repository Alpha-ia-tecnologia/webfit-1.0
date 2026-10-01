import { useState } from "react";
import { Pressable, View } from "react-native";
import { localDate } from "@shared/lib/domain";
import { SATIETY_COPY, SATIETY_LABELS, asksSatiety, satietyOptions, setMealSatiety } from "@shared/lib/symptoms";
import { shouldShowTreatment } from "@shared/lib/treatment";
import type { DiaryEntry, SatietyKey } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const TITLE = SATIETY_COPY.title;

/**
 * "Como ficou?" sob uma refeição do Diário (SERINGA-07): só com tratamento no perfil, para refeições de
 * hoje ou de ontem sem resposta (pergunta) ou com resposta (chip para alterar). Um toque grava e fecha,
 * com "Desfazer". Fica na linha do horário, depois da barra P/C/G (conceito 03), num alvo de 44 px que não
 * aumenta a linha.
 */
export function SatietyLine({ entry }: { entry: DiaryEntry }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const [isOpen, setOpen] = useState(false);
  const today = localDate();
  const p = state.profile;
  if (!p || !shouldShowTreatment(p, state.injections)) return null;
  if (!entry.satiety && !asksSatiety(entry, today)) return null;
  const meal = `${entry.title} das ${entry.time}`;
  const current = entry.satiety ?? null;
  const answer = (next: SatietyKey | null) => {
    setOpen(false);
    // O valor que "Desfazer" devolve é lido dentro da gravação, na versão mais recente do estado.
    let previous: SatietyKey | null = null;
    void commit(
      (s) => {
        previous = s.diary.find((e) => e.id === entry.id)?.satiety ?? null;
        return setMealSatiety(s, entry.id, next, new Date().toISOString());
      },
      next ? SATIETY_COPY.saved(next) : SATIETY_COPY.removed,
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => setMealSatiety(s, entry.id, previous, new Date().toISOString()), SATIETY_COPY.undone),
      },
    );
  };
  return (
    <View style={styles.line}>
      {current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SATIETY_COPY.chipLabel(current, meal)}
          {...webAttrs({ "aria-haspopup": "dialog" })}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <View style={styles.chipLook}>
            <AppText size={fontSize.sm} weight={700} color={colors.text2} numberOfLines={1}>
              {SATIETY_COPY.chip(current)}
            </AppText>
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SATIETY_COPY.askLabel(meal)}
          {...webAttrs({ "aria-haspopup": "dialog" })}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.ask, pressed && styles.pressed]}
        >
          <AppText size={fontSize.sm} weight={700} color={colors.green700} numberOfLines={1}>
            {TITLE}
          </AppText>
        </Pressable>
      )}
      <Sheet visible={isOpen} title={TITLE} onClose={() => setOpen(false)}>
        <AppText size={fontSize.sm} color={colors.muted}>
          {meal}
        </AppText>
        <View role="group" aria-label={TITLE} style={styles.options}>
          {satietyOptions(p, today).map((key) => {
            const isOn = key === current;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={SATIETY_LABELS[key]}
                accessibilityState={{ selected: isOn }}
                {...webAttrs({ "aria-pressed": isOn })}
                onPress={() => answer(key)}
                style={({ pressed }) => [styles.option, isOn && styles.optionOn, pressed && styles.pressed]}
              >
                <AppText size={fontSize.base} weight={isOn ? 700 : 600} color={isOn ? colors.green800 : colors.text}>
                  {SATIETY_LABELS[key]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {current ? <Button label={SATIETY_COPY.clear} variant="text" onPress={() => answer(null)} style={styles.clear} /> : null}
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  /** Alvo de 44 px na linha do horário; a margem negativa mantém a linha com a altura dela. */
  line: { flexShrink: 0, minHeight: 44, marginVertical: -10, justifyContent: "center" },
  ask: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  chip: { minHeight: 44, justifyContent: "center" },
  /** Resposta dada: chip cinza de 28 px (o toque continua com 44). */
  chipLook: { height: 28, justifyContent: "center", paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  pressed: { opacity: 0.75 },
  options: { gap: 8 },
  option: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.selectedBorder, backgroundColor: colors.chipOnTint },
  clear: { alignSelf: "center" },
}));
