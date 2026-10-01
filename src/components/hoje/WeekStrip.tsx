import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "../../lib/context";
import { presenceFraction, presenceLabel, weekPresence, type DayPresence } from "../../lib/diary-day";
import { localDate, shiftDate } from "../../lib/domain";
import { dateStrip, type StripRange } from "../../lib/today";
import { arcDash } from "../../lib/charts";
import { DatePickerButton } from "../DatePickerButton";
import "./WeekStrip.css";

type Props = {
  value: string;
  onChange: (date: string) => void;
  /** Nome acessível do grupo de dias. */
  label?: string;
  /** Diário: setas, teclado e deslizar trocam o dia; no Hoje, só os 7 dias. */
  isBrowsable?: boolean;
  /** Nome acessível do campo de data que o botão de calendário abre. */
  inputLabel?: string;
  /**
   * "rings" (Hoje): anel contínuo de presença (água, refeição, combinado ÷ 3), hoje numa pílula
   * branca. "dots" (Diário): número com um ponto nos dias com registro, dia escolhido em navy.
   */
  variant?: "rings" | "dots";
  /** "trailing": 7 dias até hoje; "week": segunda a domingo, com os dias futuros desabilitados. */
  range?: StripRange;
  /** Botão de calendário ao fim da faixa (o Diário o leva para o cabeçalho: false). */
  showCalendar?: boolean;
};

/** Deslocamento horizontal mínimo, em px, para o gesto contar como troca de semana. */
const SWIPE_MIN_PX = 48;
const WEEK_DAYS = 7;
const RING_CENTER = 18;
const RING_RADIUS = 15.25;
const RING_STROKE = 3.5;

/**
 * Anel de 30 px: um arco contínuo com a parte do dia que teve registro (verde; hoje, o gradiente
 * azul da marca); futuro = contorno tracejado, sem arco.
 */
function PresenceRing({
  presence,
  isFuture,
  isToday,
}: {
  presence: DayPresence;
  isFuture: boolean;
  isToday: boolean;
}) {
  const percent = presenceFraction(presence) * 100;
  const gradientId = useId();
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      {isToday && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--wf-sky-500)" />
            <stop offset="100%" stopColor="var(--wf-blue)" />
          </linearGradient>
        </defs>
      )}
      <circle
        className={isFuture ? "week-track is-future" : "week-track"}
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={isFuture ? 1.5 : RING_STROKE}
      />
      {!isFuture && percent > 0 && (
        <circle
          className="week-arc"
          // Estilo inline: a regra .week-arc do CSS venceria o atributo stroke.
          style={isToday ? { stroke: `url(#${gradientId})` } : undefined}
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={arcDash(RING_RADIUS, percent)}
          transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
        />
      )}
    </svg>
  );
}

/**
 * Faixa de 7 dias. Sem marca de falta nem sequência: só mostra o que foi registrado. Os dias
 * futuros (range "week") aparecem desabilitados, sem cobrança.
 */
export function WeekStrip({
  value,
  onChange,
  label = "Escolher o dia",
  isBrowsable = false,
  inputLabel = "Escolher data",
  variant = "rings",
  range = "trailing",
  showCalendar = true,
}: Props) {
  const { state } = useApp();
  const today = localDate();
  const days = dateStrip(value, today, WEEK_DAYS, range);
  const presence = weekPresence(
    state.diary,
    state.habits,
    days.map((d) => d.date),
  );
  const chips = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const movedByKeyboard = useRef(false);
  const go = (date: string) => {
    const next = date > today ? today : date;
    if (next !== value) onChange(next);
  };
  // Pelo teclado, o foco acompanha o dia escolhido.
  useEffect(() => {
    if (!movedByKeyboard.current) return;
    movedByKeyboard.current = false;
    chips.current?.querySelector<HTMLButtonElement>(".week-chip.active")?.focus();
  }, [value]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isBrowsable || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    movedByKeyboard.current = true;
    go(shiftDate(value, event.key === "ArrowLeft" ? -1 : 1));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipe.current = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!isBrowsable || !start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Deslizar para a esquerda avança uma semana; para a direita, volta.
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5)
      go(shiftDate(value, dx < 0 ? WEEK_DAYS : -WEEK_DAYS));
  };
  const className = ["week-strip", `is-${variant}`, isBrowsable ? "is-browsable" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className} role="group" aria-label={label}>
      {isBrowsable && (
        <button type="button" className="week-arrow" aria-label="Dia anterior" onClick={() => go(shiftDate(value, -1))}>
          <ChevronLeft size={17} />
        </button>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- delegação: as setas vêm dos botões dos dias; o deslizar tem os botões Dia anterior e Próximo dia */}
      <div
        className="week-days"
        ref={chips}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        {days.map((d, i) => {
          const logged = presenceLabel(presence[i]);
          const isActive = d.date === value;
          const hasRecord = logged !== "";
          return (
            <button
              key={d.date}
              type="button"
              className={[
                "week-chip",
                isActive ? "active" : "",
                d.isToday ? "today" : "",
                d.isFuture ? "is-future" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={d.isFuture}
              aria-pressed={isBrowsable ? isActive : undefined}
              aria-current={d.isToday ? "date" : undefined}
              aria-label={logged ? `${d.aria}, com ${logged}` : d.aria}
              onClick={() => onChange(d.date)}
            >
              <span className="week-chip-day">{d.weekday}</span>
              {variant === "rings" ? (
                <span className="week-ring">
                  <PresenceRing presence={presence[i]} isFuture={d.isFuture} isToday={d.isToday} />
                  <strong>{Number(d.date.slice(8))}</strong>
                </span>
              ) : (
                <>
                  <strong className="week-number">{Number(d.date.slice(8))}</strong>
                  <span className={hasRecord ? "week-dot is-on" : "week-dot"} aria-hidden="true" />
                </>
              )}
            </button>
          );
        })}
      </div>
      {isBrowsable && (
        <button
          type="button"
          className="week-arrow"
          aria-label="Próximo dia"
          disabled={value >= today}
          onClick={() => go(shiftDate(value, 1))}
        >
          <ChevronRight size={17} />
        </button>
      )}
      {isBrowsable && showCalendar && (
        <DatePickerButton
          className="week-calendar"
          value={value}
          max={today}
          inputLabel={inputLabel}
          onChange={onChange}
        />
      )}
    </div>
  );
}
