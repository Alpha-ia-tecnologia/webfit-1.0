import { useEffect, useId, useState } from "react";
import { Droplet, Moon, Pencil, Plus, Syringe, Trash2 } from "lucide-react";
import { MOOD_LABELS } from "../../lib/day";
import { moodEmoji, waterLiters, waterTimes, wellbeingTitle } from "../../lib/diary-day";
import { fmtMl, fmtNumber } from "../../lib/format";
import { injectionDetail, injectionTitle } from "../../lib/injection";
import { SYMPTOM_LABELS, symptomText } from "../../lib/symptoms";
import type { DiaryEntry, InjectionEntry } from "../../types";
import { FoodGlyph } from "../meal/FoodGlyph";
import { OverflowMenu } from "../OverflowMenu";
import { SegmentMeter } from "../SegmentMeter";
import { WaterGlasses } from "./WaterGlasses";
import "../sintomas/Sintomas.css";

const SYMPTOM_DOTS = [1, 2, 3] as const;

/** Volume do "+" da linha de água. */
export const WATER_QUICK_ML = 250;

/**
 * A água do dia num cartão (conceito 03): gota, os horários, "1,75 / 2,5 L", 10 copos e "+ 250 ml".
 * Tocar no cabeçalho abre os registros, cada um com o "⋯" (Editar, Excluir).
 */
export function WaterLine({
  totalMl,
  goalMl,
  entries,
  highlightId,
  onAdd,
  onEdit,
  onRemove,
}: {
  totalMl: number;
  goalMl: number | null;
  entries: DiaryEntry[];
  highlightId: string | null;
  onAdd: () => void;
  onEdit: (entry: DiaryEntry) => void;
  onRemove: (id: string) => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const listId = useId();
  const isExpanded = isOpen && entries.length > 0;
  const times = waterTimes(entries);
  // Um resultado da busca que é de água abre a lista para mostrar o registro.
  useEffect(() => {
    if (highlightId && entries.some((e) => e.id === highlightId)) setOpen(true);
  }, [highlightId, entries]);
  return (
    <article className="diary-card diary-water">
      <div className="diary-water-head">
        <FoodGlyph icon={Droplet} size={40} tone="sky" bordered />
        <div className="diary-water-copy">
          <h3>Água</h3>
          {times && <p className="diary-row-time">{times}</p>}
        </div>
        <p className="diary-water-value">
          <strong data-testid="diary-water-total">{waterLiters(totalMl)}</strong>
          <small>{goalMl !== null && goalMl > 0 ? ` / ${waterLiters(goalMl)} L` : " L"}</small>
        </p>
        {/* O cabeçalho inteiro abre a lista dos registros (o botão cobre a linha, por cima do texto). */}
        {entries.length > 0 && (
          <button
            type="button"
            className="diary-water-toggle"
            aria-expanded={isExpanded}
            aria-controls={isExpanded ? listId : undefined}
            aria-label={`Registros de água (${entries.length})`}
            onClick={() => setOpen(!isOpen)}
          />
        )}
      </div>
      <div className="diary-water-row">
        <WaterGlasses totalMl={totalMl} goalMl={goalMl} />
        <button
          type="button"
          className="diary-water-add"
          aria-label={`Adicionar ${WATER_QUICK_ML} ml de água`}
          onClick={onAdd}
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          {WATER_QUICK_ML} ml
        </button>
      </div>
      {isExpanded && (
        <ul id={listId} className="diary-water-list">
          {entries.map((e) => (
            <li key={e.id} className={highlightId === e.id ? "is-highlight" : ""} data-entry-id={e.id}>
              <span className="diary-row-time">{e.time}</span>
              <span className="diary-water-amount">{fmtMl(e.amountMl ?? 0)}</span>
              <OverflowMenu
                variant="ghost"
                label={`Mais ações: ${e.title} das ${e.time}`}
                items={[
                  { label: "Editar", icon: Pencil, onSelect: () => onEdit(e) },
                  { label: "Excluir", icon: Trash2, onSelect: () => onRemove(e.id) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * Bem-estar numa linha (conceito 03): o rosto da nota, a anotação (ou "Bem"), a barra de 5 do humor,
 * o horário e o sono num chip na mesma linha; efeitos e marcadores seguem como chips. Editar e excluir no "⋯".
 */
export function WellbeingRow({
  entry,
  isHighlighted,
  onEdit,
  onRemove,
}: {
  entry: DiaryEntry;
  isHighlighted: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const rating = entry.rating;
  return (
    <article
      className={`diary-card diary-entry diary-mood-row ${isHighlighted ? "is-highlight" : ""}`}
      data-entry-id={entry.id}
    >
      <FoodGlyph glyph={moodEmoji(rating)} size={40} tone="mind" />
      <div className="diary-row-copy">
        <p className="diary-row-title">{wellbeingTitle(entry)}</p>
        <p className="diary-row-meta">
          {rating ? (
            <SegmentMeter
              value={rating}
              total={5}
              tone="mind"
              size="md"
              className="diary-mood-meter"
              label={`Humor ${rating} de 5, ${MOOD_LABELS[Math.min(5, Math.max(1, rating)) - 1]}`}
            />
          ) : null}
          <span className="diary-row-time">{entry.time}</span>
          {/* O sono na linha do horário: o título ("Acordei disposta") fica inteiro ao lado do "⋯". */}
          {entry.sleepHours !== undefined && (
            <span className="diary-sleep-chip">
              <Moon size={14} aria-hidden="true" />
              {fmtNumber(entry.sleepHours, 1)} h<span className="sr-only"> de sono</span>
            </span>
          )}
          {/* Efeitos percebidos (SERINGA-07): rótulo e pontinhos à vista; o leitor de tela ouve "Náusea, intensidade forte". */}
          {entry.symptoms?.map((s) => (
            <span key={s.key} className="diary-chip is-symptom">
              <span aria-hidden="true">{SYMPTOM_LABELS[s.key]}</span>
              <span className="symptom-mini" aria-hidden="true">
                {SYMPTOM_DOTS.map((level) => (
                  <i key={level} className={level <= s.intensity ? "is-on" : ""} />
                ))}
              </span>
              <span className="sr-only">{symptomText(s)}</span>
            </span>
          ))}
          {entry.tags?.map((tag) => (
            <span key={tag} className="diary-chip is-tag">
              {tag}
            </span>
          ))}
        </p>
      </div>
      <OverflowMenu
        variant="ghost"
        label={`Mais ações: ${entry.title} das ${entry.time}`}
        items={[
          { label: "Editar", icon: Pencil, onSelect: onEdit },
          { label: "Excluir", icon: Trash2, onSelect: onRemove },
        ]}
      />
    </article>
  );
}

/** Aplicação de injetável registrada na calculadora de seringa e dose; editar e excluir no "⋯". */
export function InjectionRow({
  entry,
  isHighlighted,
  onEdit,
  onRemove,
}: {
  entry: InjectionEntry;
  isHighlighted: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const title = injectionTitle(entry);
  return (
    <article
      className={`diary-card diary-entry diary-injection-row ${isHighlighted ? "is-highlight" : ""}`}
      data-entry-id={entry.id}
    >
      <FoodGlyph icon={Syringe} size={40} tone="indigo" bordered />
      <div className="diary-row-copy">
        <h3 className="diary-row-title">{title}</h3>
        <p className="diary-row-meta">
          <span className="diary-row-time">{entry.time}</span>
          <span className="diary-row-sub">{injectionDetail(entry)}</span>
        </p>
        {entry.notes && <p className="hint">{entry.notes}</p>}
      </div>
      <OverflowMenu
        variant="ghost"
        label={`Mais ações: aplicação ${title}`}
        items={[
          { label: "Editar", icon: Pencil, onSelect: onEdit },
          { label: "Excluir", icon: Trash2, onSelect: onRemove },
        ]}
      />
    </article>
  );
}
