import { CalendarCheck } from "lucide-react-native";
import { useMemo, useState } from "react";
import { weekRecap } from "@shared/lib/week-recap";
import { MoreRow } from "@/components/evolucao/more-row";
import { useApp } from "@/state/app-context";
import { WeekRecapCard } from "./week-recap-card";
import { WeekStories } from "./week-stories";

/**
 * "Sua semana" na Evolução: todo dia, sem dispensar (a entrada permanente dos stories). `variant="row"` é a linha de
 * "Mais da sua evolução" (conceito 09): o período e a seta, que abre os stories.
 */
export function EvolucaoWeekRecap({ today, variant = "card" }: { today: string; variant?: "card" | "row" }) {
  const { state } = useApp();
  const [isOpen, setOpen] = useState(false);
  const recap = useMemo(() => weekRecap(state, today), [state, today]);
  if (!recap) return null;
  return (
    <>
      {variant === "row" ? (
        <MoreRow
          icon={CalendarCheck}
          tone="habit"
          title="Sua semana"
          value={recap.week.label}
          accessibilityLabel={`Ver sua semana, ${recap.week.label}`}
          isDialog={false}
          testID="week-recap"
          onPress={() => setOpen(true)}
        />
      ) : (
        <WeekRecapCard recap={recap} onOpen={() => setOpen(true)} />
      )}
      {isOpen && <WeekStories recap={recap} onClose={() => setOpen(false)} />}
    </>
  );
}
