import { lazy, Suspense, useMemo, useState } from "react";
import { useApp } from "../../lib/context";
import { weekRecap } from "../../lib/week-recap";
import { STORIES_LOAD_ERROR, StoriesBoundary } from "./StoriesBoundary";
import { WeekRecapCard } from "./WeekRecapCard";

// Stories, partes e imagem carregam só ao abrir.
const WeekStories = lazy(() => import("./WeekStories").then((m) => ({ default: m.WeekStories })));

/**
 * "Sua semana" na Evolução: a mesma entrada todos os dias (sem dispensar), a porta permanente dos
 * stories. Some com menos de 2 dias com registro na última semana completa. `variant="row"` é a
 * linha da lista "Mais da sua evolução" (conceito 09), já dentro de um `<li>`.
 */
export function EvolucaoWeekRecap({
  today,
  variant = "card",
}: {
  today: string;
  variant?: "card" | "row";
}) {
  const { state, notify } = useApp();
  const [isOpen, setOpen] = useState(false);
  const recap = useMemo(() => weekRecap(state, today), [state, today]);
  if (!recap) return null;
  const content = (
    <>
      <WeekRecapCard recap={recap} onOpen={() => setOpen(true)} variant={variant} />
      {isOpen && (
        <StoriesBoundary
          onError={() => {
            setOpen(false);
            notify(STORIES_LOAD_ERROR, "warning");
          }}
        >
          <Suspense fallback={null}>
            <WeekStories recap={recap} onClose={() => setOpen(false)} />
          </Suspense>
        </StoriesBoundary>
      )}
    </>
  );
  return variant === "row" ? <li className="evol-more-item">{content}</li> : content;
}
