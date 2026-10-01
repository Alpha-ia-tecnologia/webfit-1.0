import { useRef, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { emptyDraft, localDate, uid } from "@shared/lib/domain";
import {
  isStarterState,
  starterInputSchema,
  startWithHabits,
} from "@shared/lib/starter";
import { StarterFlow } from "@/components/onboarding/starter-flow";
import { StarterHome } from "@/components/onboarding/starter-home";
import { useApp } from "@/state/app-context";
import { makeStyles } from "@/theme/theme";
import { AnamneseScreen } from "./anamnese";

export function OnboardingEntry() {
  const styles = useStyles();
  const { state, commit } = useApp();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [detailed, setDetailed] = useState(false);
  const [name, setName] = useState(String(state.draft?.name ?? ""));
  const [goal, setGoal] = useState(String(state.draft?.goal ?? ""));
  const [consent, setConsent] = useState(state.draft?.consentLocal === true);
  const [habitIndex, setHabitIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = isStarterState(state);
  const today = localDate();

  const personalize = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!started && consent) {
        const saved = await commit((current) => ({
          ...current,
          draft: {
            ...emptyDraft(),
            ...current.draft,
            name,
            goal,
            consentLocal: true,
          },
        }));
        if (!saved) return;
      }
      setDetailed(true);
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    if (busy) return;
    const result = starterInputSchema.safeParse({
      name,
      goal,
      consentLocal: consent,
      habitIndex,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Confira seus dados.");
      return;
    }
    setError("");
    setBusy(true);
    const id = uid();
    try {
      await commit((current) =>
        startWithHabits(current, result.data, today, id),
      );
    } finally {
      setBusy(false);
    }
  };
  /** Depois de "Excluir dados e recomeçar": volta ao primeiro acesso com os campos vazios. */
  const clearLocal = () => {
    setDetailed(false);
    setName("");
    setGoal("");
    setConsent(false);
    setHabitIndex(null);
  };
  if (state.profile || detailed || (state.draft && !started))
    return (
      <AnamneseScreen
        onBackToHabits={started ? () => setDetailed(false) : undefined}
      />
    );
  const contentStyle = [
    styles.content,
    { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
  ];
  // Primeiro acesso: três telas curtas (valor, sobre você, primeiro passo). O restaurar
  // backup fica na primeira tela; o cartão "Seus dados" só aparece depois de começar.
  if (!started)
    return (
      <ScrollView
        ref={scroller}
        style={styles.root}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
      >
        <StarterFlow
          name={name}
          onName={setName}
          goal={goal}
          onGoal={setGoal}
          consent={consent}
          onConsent={setConsent}
          habitIndex={habitIndex}
          onHabit={setHabitIndex}
          error={error}
          busy={busy}
          onSubmit={() => void start()}
          onPersonalize={() => void personalize()}
          onScreenChange={() =>
            scroller.current?.scrollTo({ y: 0, animated: false })
          }
        />
      </ScrollView>
    );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
    >
      <StarterHome
        onPersonalize={() => void personalize()}
        busy={busy}
        onReset={clearLocal}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 16,
    gap: 16,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
}));
