import { useState } from "react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import { SATIETY_COPY, SATIETY_LABELS, asksSatiety, satietyOptions, setMealSatiety } from "../../lib/symptoms";
import { shouldShowTreatment } from "../../lib/treatment";
import type { DiaryEntry, SatietyKey } from "../../types";
import { Modal } from "../UI";
import "./Sintomas.css";

/** Folha "Como ficou?": um toque grava e fecha; "Limpar resposta" só com resposta dada. */
function SatietySheet({
  entry,
  onAnswer,
  onClose,
}: {
  entry: DiaryEntry;
  onAnswer: (next: SatietyKey | null) => void;
  onClose: () => void;
}) {
  const { state } = useApp();
  const options = state.profile ? satietyOptions(state.profile, localDate()) : [];
  return (
    <Modal title={SATIETY_COPY.title} onClose={onClose} className="satiety-sheet">
      <p className="muted">
        {entry.title} das {entry.time}
      </p>
      <div className="satiety-options" role="group" aria-label={SATIETY_COPY.title}>
        {options.map((key) => (
          <button key={key} type="button" aria-pressed={entry.satiety === key} onClick={() => onAnswer(key)}>
            {SATIETY_LABELS[key]}
          </button>
        ))}
      </div>
      {entry.satiety && (
        <button type="button" className="text-btn satiety-clear" onClick={() => onAnswer(null)}>
          {SATIETY_COPY.clear}
        </button>
      )}
    </Modal>
  );
}

/**
 * "Como ficou?" sob a refeição do Diário (SERINGA-07), só com tratamento: pergunta nas refeições de
 * hoje e de ontem; com resposta, mostra o rótulo para alterar. A linha e o menu da refeição não mudam.
 */
export function SatietyLine({ entry }: { entry: DiaryEntry }) {
  const { state, commit } = useApp();
  const [isOpen, setOpen] = useState(false);
  const p = state.profile;
  if (!p || !shouldShowTreatment(p, state.injections)) return null;
  const current = entry.satiety ?? null;
  if (!current && !asksSatiety(entry, localDate())) return null;
  const where = `${entry.title} das ${entry.time}`;
  const answer = (next: SatietyKey | null) => {
    setOpen(false);
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
          void commit(
            (s) => setMealSatiety(s, entry.id, previous, new Date().toISOString()),
            SATIETY_COPY.undone,
          ),
      },
    );
  };
  return (
    <div className="diary-satiety">
      {/* O mesmo botão nos dois estados: fechar a folha devolve o foco a ele. */}
      <button
        type="button"
        className={current ? "satiety-chip" : "text-btn satiety-ask"}
        aria-label={current ? SATIETY_COPY.chipLabel(current, where) : SATIETY_COPY.askLabel(where)}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {current ? SATIETY_COPY.chip(current) : SATIETY_COPY.title}
      </button>
      {isOpen && <SatietySheet entry={entry} onAnswer={answer} onClose={() => setOpen(false)} />}
    </div>
  );
}
