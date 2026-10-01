import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Minus, Plus } from "lucide-react";
import {
  formatValue,
  offsetFromValue,
  rulerTicks,
  snapToStep,
  toNumber,
  valueFromOffset,
  type RulerConfig,
} from "./inputs";
import { OptionalTag } from "./OptionalTag";

type Props = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value: string | number | null;
  config: RulerConfig;
  /** Texto auxiliar sob o valor. */
  helper?: string;
  /** false: um controle composto já desenha o campo espelho deste nome (um só por nome). */
  hasMirror?: boolean;
  onChange: (value: string) => void;
};

const SNAP_DELAY_MS = 120;

/**
 * Régua horizontal arrastável com marcador central e −/+ ao lado do número.
 * Opcional sem valor fica recolhida numa linha com "Informar".
 */
export function Ruler({
  id,
  name,
  label,
  hint,
  error,
  optional,
  value,
  config,
  helper,
  hasMirror = true,
  onChange,
}: Props) {
  const numeric = toNumber(value);
  const current = numeric ?? config.initial;
  const isEmpty = numeric === null;
  const [isOpen, setOpen] = useState(false);
  const isCollapsed = !!optional && isEmpty && !isOpen;
  const scroller = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"slider" | "add" | null>(null);
  const isSyncing = useRef(false);
  const isArmed = useRef(false);
  const fromScroll = useRef<number | null>(null);
  const frame = useRef(0);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const ticks = useMemo(() => rulerTicks(config), [config]);
  const helpId = hint || error ? `${id}-help` : undefined;

  const moveTo = (target: number) => {
    const el = scroller.current;
    if (!el || Math.abs(el.scrollLeft - target) < 1) return;
    isSyncing.current = true;
    el.scrollLeft = target;
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };
  // Posiciona a régua quando o valor muda por botões, teclado ou preenchimento externo.
  useEffect(() => {
    if (fromScroll.current === current) return;
    moveTo(offsetFromValue(current, config));
  }, [current, config, isCollapsed]);
  // Ao abrir ou recolher pela ação da pessoa, o foco segue para o controle que apareceu.
  useEffect(() => {
    if (pendingFocus.current === "slider") slider.current?.focus();
    if (pendingFocus.current === "add") addButton.current?.focus();
    pendingFocus.current = null;
  }, [isCollapsed]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      if (snapTimer.current) clearTimeout(snapTimer.current);
    },
    [],
  );

  const arm = () => {
    isArmed.current = true;
  };
  const commit = (next: number) => {
    arm();
    fromScroll.current = null;
    onChange(String(snapToStep(next, config)));
  };
  const clear = () => {
    fromScroll.current = null;
    isArmed.current = false;
    pendingFocus.current = optional ? "add" : null;
    setOpen(false);
    onChange("");
  };
  const onScroll = () => {
    if (isSyncing.current || !isArmed.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scroller.current;
      if (!el) return;
      const next = valueFromOffset(el.scrollLeft, config);
      if (next !== numeric) {
        fromScroll.current = next;
        onChange(String(next));
      }
      if (snapTimer.current) clearTimeout(snapTimer.current);
      snapTimer.current = setTimeout(() => {
        if (!drag.current) moveTo(offsetFromValue(next, config));
      }, SNAP_DELAY_MS);
    });
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    arm();
    if (e.pointerType !== "mouse" || !scroller.current) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft };
    scroller.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !scroller.current) return;
    scroller.current.scrollLeft =
      drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const left = scroller.current?.scrollLeft ?? 0;
    moveTo(offsetFromValue(valueFromOffset(left, config), config));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowRight: config.step,
      ArrowUp: config.step,
      ArrowLeft: -config.step,
      ArrowDown: -config.step,
      PageUp: config.fineStep * 4,
      PageDown: -config.fineStep * 4,
    };
    if (e.key in steps) {
      e.preventDefault();
      commit(current + steps[e.key]);
    } else if (e.key === "Home") {
      e.preventDefault();
      commit(config.min);
    } else if (e.key === "End") {
      e.preventDefault();
      commit(config.max);
    }
  };
  const shown = isEmpty ? "—" : formatValue(numeric, config.decimals);
  const fine = formatValue(config.fineStep, config.fineStep % 1 ? 1 : 0);
  // Rótulos inteiros quando o espaçamento entre traços maiores é inteiro (ex.: 0,2 × 5 = 1).
  const labelDecimals =
    Number((config.tickStep * config.majorEvery).toFixed(6)) % 1 ? 1 : 0;
  const mirror = hasMirror && (
    <input
      className="q-mirror"
      name={name}
      type="number"
      min={config.min}
      max={config.max}
      step={config.step}
      tabIndex={-1}
      aria-hidden="true"
      value={value ?? ""}
      onChange={(e) => {
        fromScroll.current = null;
        onChange(e.target.value);
      }}
    />
  );
  const help = helpId && (
    <p
      id={helpId}
      className={error ? "field-error" : "hint"}
      role={error ? "alert" : undefined}
    >
      {error || hint}
    </p>
  );
  if (isCollapsed)
    return (
      // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o CSS de erro e o foco no primeiro campo inválido (ScreenAnamnese) leem este aria-invalid
      <div
        className="q-block q-collapsed"
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={helpId}
        aria-invalid={!!error}
        data-field={name}
        tabIndex={-1}
      >
        <span id={`${id}-label`} className="q-label">
          {label}
          <OptionalTag />
        </span>
        <button
          ref={addButton}
          type="button"
          className="q-add"
          aria-label={`Informar ${label}`}
          onClick={() => {
            pendingFocus.current = "slider";
            setOpen(true);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          Informar
        </button>
        {mirror}
        {help}
      </div>
    );
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o CSS de erro e o foco no primeiro campo inválido (ScreenAnamnese) leem este aria-invalid
    <div
      className="q-block"
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={helpId}
      aria-invalid={!!error}
      data-field={name}
      tabIndex={-1}
    >
      <div className="q-head">
        <span id={`${id}-label`} className="q-label">
          {label}
          {optional && <OptionalTag />}
        </span>
        {config.allowNone && (
          <button type="button" className="q-none" onClick={clear}>
            Não informar
          </button>
        )}
      </div>
      <div className={`ruler-card ${isEmpty ? "empty" : ""}`}>
        <div className="ruler-value-row">
          <button
            type="button"
            className="fine-btn"
            aria-label={`Diminuir ${fine} ${config.unit}`}
            onClick={() => commit(current - config.fineStep)}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <div className="ruler-value">
            <strong>{shown}</strong>
            <span>{config.unit}</span>
          </div>
          <button
            type="button"
            className="fine-btn"
            aria-label={`Aumentar ${fine} ${config.unit}`}
            onClick={() => commit(current + config.fineStep)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        {helper && <p className="ruler-helper">{helper}</p>}
        <div
          ref={slider}
          className="ruler"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={config.min}
          aria-valuemax={config.max}
          aria-valuenow={numeric ?? undefined}
          aria-valuetext={
            isEmpty
              ? "não informado"
              : `${formatValue(numeric, config.decimals)} ${config.unit}`
          }
          onKeyDown={onKeyDown}
        >
          <div className="ruler-marker" aria-hidden="true" />
          <div
            ref={scroller}
            className="ruler-scroll"
            onScroll={onScroll}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onTouchStart={arm}
            onWheel={arm}
          >
            <div className="ruler-track">
              {ticks.map((tick) => (
                <span
                  key={tick.value}
                  // O rótulo sob o ponteiro some: o número grande acima já mostra o valor.
                  className={`tick ${tick.major ? "major" : tick.mid ? "mid" : ""} ${tick.value === current ? "center" : ""} ${!isEmpty && tick.value === numeric ? "current" : ""}`}
                  data-label={
                    tick.major
                      ? formatValue(tick.value, labelDecimals)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {mirror}
      {help}
    </div>
  );
}
