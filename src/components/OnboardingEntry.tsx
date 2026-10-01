import { useState, type FormEvent } from "react";
import { useApp } from "../lib/context";
import { emptyDraft, localDate, uid } from "../lib/domain";
import {
  isStarterState,
  starterInputSchema,
  startWithHabits,
} from "../lib/starter";
import { ScreenAnamnese } from "./ScreenAnamnese";
import { StarterFlow } from "./onboarding/StarterFlow";
import { StarterHome } from "./onboarding/StarterHome";
import "./OnboardingEntry.css";

export function OnboardingEntry() {
  const { state, commit } = useApp();
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
  if (state.profile || detailed || (state.draft && !started))
    return (
      <ScreenAnamnese
        onBackToHabits={started ? () => setDetailed(false) : undefined}
      />
    );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
  // Primeiro acesso: três telas curtas (valor, sobre você, primeiro passo).
  if (!started)
    return (
      <div className="starter-entry">
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
          onSubmit={(event) => void submit(event)}
          onPersonalize={() => void personalize()}
        />
      </div>
    );

  return (
    <StarterHome
      onPersonalize={() => void personalize()}
      busy={busy}
      onReset={() => {
        setDetailed(false);
        setName("");
        setGoal("");
        setConsent(false);
        setHabitIndex(null);
      }}
    />
  );
}
