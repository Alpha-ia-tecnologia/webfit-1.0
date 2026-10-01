import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useApp } from "../../lib/context";
import { isRecapDay, shouldShowRecapCard, weekRecap } from "../../lib/week-recap";
import { STORIES_LOAD_ERROR, StoriesBoundary } from "./StoriesBoundary";
import { useRecapDismissal } from "./useRecapDismissal";
import { WeekRecapCard } from "./WeekRecapCard";

// Stories, partes e imagem carregam só ao abrir: o Hoje continua leve.
const WeekStories = lazy(() => import("./WeekStories").then((m) => ({ default: m.WeekStories })));

const FOCUSABLE = 'button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]';

/** Primeiro elemento focável visível depois de `node` na ordem do documento (fora dele). */
function focusableAfter(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE));
  return (
    all.find(
      (el) =>
        !node.contains(el) &&
        Boolean(node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        el.getClientRects().length > 0,
    ) ?? null
  );
}

/**
 * "Sua semana" no Hoje (EVOL-05): só às segundas, com pelo menos 2 dias com registro na semana
 * anterior e enquanto a semana não for dispensada neste aparelho. Não é uma seção de "Editar Hoje"
 * (fica fora de .hoje-slot); ao dispensar, o foco vai para o próximo elemento e o aviso tem "Desfazer".
 */
export function HojeWeekRecap({ today }: { today: string }) {
  const { state, notify } = useApp();
  const { dismissed, dismiss, restore } = useRecapDismissal();
  const [isOpen, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const recap = useMemo(() => (isRecapDay(today) ? weekRecap(state, today) : null), [state, today]);
  if (!recap || !shouldShowRecapCard(recap, today, dismissed)) return null;
  const handleDismiss = () => {
    const previous = dismissed;
    const next = focusableAfter(ref.current);
    dismiss(recap.week.start);
    notify("Resumo da semana dispensado.", "info", {
      label: "Desfazer",
      onAction: () => restore(previous),
    });
    requestAnimationFrame(() => next?.focus());
  };
  return (
    <div className="hoje-recap" ref={ref}>
      <WeekRecapCard recap={recap} onOpen={() => setOpen(true)} onDismiss={handleDismiss} />
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
    </div>
  );
}
