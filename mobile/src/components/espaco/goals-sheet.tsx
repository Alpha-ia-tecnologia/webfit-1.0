import { useRouter } from "expo-router";
import { RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { toNumber } from "@shared/components/anamnese/inputs";
import type { ManualGoals } from "@shared/lib/domain";
import {
  AUTO_GOALS,
  commitManualGoals,
  goalHint,
  goalSteppers,
  hasManualGoals,
  manualGoalsOf,
} from "@shared/lib/space";
import { Stepper } from "@/components/anamnese/stepper";
import { AppText, Button, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/**
 * "Ajustar metas": passos para as metas manuais do perfil (sem energia com calorias ocultas),
 * "Voltar ao automático" e salvar com Desfazer. Grava o perfil e a meta do dia.
 */
export function GoalsSheet({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const router = useRouter();
  const profile = state.profile!;
  const [draft, setDraft] = useState<ManualGoals>(() => manualGoalsOf(profile));
  const [isBusy, setBusy] = useState(false);
  const steppers = goalSteppers({ ...profile, ...draft });
  const changes: Partial<ManualGoals> = Object.fromEntries(
    steppers.map((s) => [s.field, draft[s.field]]),
  );
  const isChanged = steppers.some((s) => draft[s.field] !== profile[s.field]);
  const save = async (goals: Partial<ManualGoals>, message: string) => {
    setBusy(true);
    const saved = await commitManualGoals(commit, goals, message);
    setBusy(false);
    if (saved) onClose();
  };
  return (
    <Sheet
      visible
      title="Ajustar metas"
      onClose={onClose}
      footer={
        <View style={styles.actions}>
          <Button
            label="Salvar metas"
            wide
            disabled={!isChanged}
            busy={isBusy}
            onPress={() => void save(changes, "Metas atualizadas.")}
          />
          {hasManualGoals(profile) && (
            <Button
              label="Voltar ao automático"
              variant="secondary"
              wide
              icon={RotateCcw}
              disabled={isBusy}
              onPress={() => void save(AUTO_GOALS, "Metas de volta ao automático.")}
            />
          )}
        </View>
      }
    >
      <AppText size={fontSize.sm} color={colors.muted} lineHeight={19}>
        Em branco, cada meta segue a estimativa da anamnese; os valores que você informar
        prevalecem.
      </AppText>
      {steppers.map((stepper) => (
        // Grupo com o nome da meta: "Aumentar 5 g" da proteína e das gorduras não se confundem.
        <View key={stepper.field} role="group" aria-label={stepper.label}>
          <Stepper
            label={stepper.label}
            hint={goalHint(stepper)}
            value={draft[stepper.field]}
            config={stepper.config}
            onChange={(value) =>
              setDraft((current) => ({ ...current, [stepper.field]: toNumber(value) }))
            }
          />
        </View>
      ))}
      <Button
        label="Revisar todas as respostas na anamnese"
        variant="link"
        onPress={() => {
          onClose();
          router.push("/anamnese");
        }}
        style={styles.review}
      />
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  actions: { gap: 10 },
  review: { alignSelf: "center" },
}));
