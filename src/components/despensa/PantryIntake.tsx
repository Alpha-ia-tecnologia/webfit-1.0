import { useApp } from "../../lib/context";
import { AddPantryCard } from "./AddPantryCard";
import { PantryReview } from "./PantryReview";
import type { PantryIntakeState } from "./usePantryIntake";
import type { PantryRun } from "./usePantryRun";

/** Folha "Adicionar alimentos": o formulário (foto ou digitar) ou, com rascunhos, a revisão. */
export function PantryIntake({
  run,
  intake,
  onAttach,
  onScan,
  onSave,
  onDiscard,
  onOpenEspaco,
}: {
  run: PantryRun;
  intake: PantryIntakeState;
  onAttach: (file?: File) => void;
  onScan: () => void;
  onSave: () => void;
  /** "Descartar revisão" (a tela decide se a folha fecha). */
  onDiscard: () => void;
  onOpenEspaco: () => void;
}) {
  const { state, aiReady } = useApp();
  const hide = state.profile?.hideCalories ?? false;
  if (intake.drafts === null)
    return (
      <AddPantryCard
        busy={run.busy}
        error={run.error}
        hide={hide}
        hasConsent={!!state.profile?.consentAi}
        isAiReady={aiReady}
        canAi={run.canAi}
        photoMode={intake.photoMode}
        location={intake.location}
        photo={intake.photo}
        onPhotoMode={intake.setPhotoMode}
        onLocation={intake.setLocation}
        onAttach={onAttach}
        onScan={onScan}
        onManual={intake.startManual}
        onCancel={run.cancel}
        onOpenEspaco={onOpenEspaco}
      />
    );
  return (
    <PantryReview
      drafts={intake.drafts}
      onDrafts={intake.updateDrafts}
      isEditing={!!intake.editing}
      source={intake.source}
      newLocation={intake.location}
      scanNotes={intake.scanNotes}
      busy={run.busy}
      error={run.error}
      hide={hide}
      onSave={onSave}
      onDiscard={onDiscard}
      onCancel={run.cancel}
    />
  );
}
