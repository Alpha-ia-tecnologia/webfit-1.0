import { useMemo, useState } from "react";
import { isRecapDay, shouldShowRecapCard, weekRecap } from "@shared/lib/week-recap";
import { useApp } from "@/state/app-context";
import { useRecapDismissal } from "./use-recap-dismissal";
import { WeekRecapCard } from "./week-recap-card";
import { WeekStories } from "./week-stories";

/**
 * "Sua semana" no Hoje: só às segundas, com pelo menos 2 dias com registro na semana anterior e
 * enquanto a pessoa não dispensar (neste aparelho). Não é uma seção de "Editar Hoje".
 */
export function HojeWeekRecap({ today }: { today: string }) {
  const { state, notify } = useApp();
  const { dismissed, dismiss, restore } = useRecapDismissal();
  const [isOpen, setOpen] = useState(false);
  const recap = useMemo(() => (isRecapDay(today) ? weekRecap(state, today) : null), [state, today]);
  // Enquanto a dispensa é lida (undefined), o cartão fica oculto: nada pisca e some.
  if (!recap || dismissed === undefined || !shouldShowRecapCard(recap, today, dismissed)) return null;
  const onDismiss = () => {
    const previous = dismissed;
    dismiss(recap.week.start);
    notify("Resumo da semana dispensado.", "info", { label: "Desfazer", onAction: () => restore(previous) });
  };
  return (
    <>
      <WeekRecapCard recap={recap} onOpen={() => setOpen(true)} onDismiss={onDismiss} />
      {isOpen && <WeekStories recap={recap} onClose={() => setOpen(false)} />}
    </>
  );
}
