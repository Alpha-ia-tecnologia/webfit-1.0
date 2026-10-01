import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

export interface WheelItem {
  value: number;
  label: string;
}
type Props = {
  label: string;
  items: WheelItem[];
  value: number | null;
  onChange: (value: number) => void;
};

export const WHEEL_ITEM_HEIGHT = 40;
const SETTLE_MS = 110;

/** Roda vertical rolável (estilo seletor de data): arraste, role ou toque em um item. */
export function WheelPicker({ label, items, value, onChange }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const isArmed = useRef(false);
  const fromScroll = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ y: number; top: number } | null>(null);
  const index = items.findIndex((item) => item.value === value);
  const shownIndex = index === -1 ? 0 : index;

  const moveTo = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const target = i * WHEEL_ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) < 1) return;
    isSyncing.current = true;
    el.scrollTop = target;
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };
  useEffect(() => {
    if (fromScroll.current === value) return;
    moveTo(shownIndex);
  }, [shownIndex, value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const arm = () => {
    isArmed.current = true;
  };
  const pick = (i: number) => {
    const item = items[Math.min(items.length - 1, Math.max(0, i))];
    if (!item) return;
    arm();
    fromScroll.current = null;
    onChange(item.value);
  };
  const onScroll = () => {
    if (isSyncing.current || !isArmed.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = scroller.current;
      if (!el) return;
      const i = Math.min(
        items.length - 1,
        Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT)),
      );
      const item = items[i];
      if (item && item.value !== value) {
        fromScroll.current = item.value;
        onChange(item.value);
      }
      if (!drag.current) moveTo(i);
    }, SETTLE_MS);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    arm();
    if (e.pointerType !== "mouse" || !scroller.current) return;
    drag.current = { y: e.clientY, top: scroller.current.scrollTop };
    scroller.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !scroller.current) return;
    scroller.current.scrollTop =
      drag.current.top - (e.clientY - drag.current.y);
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const el = scroller.current;
    if (el) moveTo(Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      pick(shownIndex - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      pick(shownIndex + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      pick(0);
    } else if (e.key === "End") {
      e.preventDefault();
      pick(items.length - 1);
    }
  };
  const currentItem = items[shownIndex];
  return (
    <div
      className="wheel"
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={items[0]?.value}
      aria-valuemax={items[items.length - 1]?.value}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? "não informado" : currentItem?.label}
      onKeyDown={onKeyDown}
    >
      <div className="wheel-band" aria-hidden="true" />
      <div
        ref={scroller}
        className="wheel-scroll"
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onTouchStart={arm}
        onWheel={arm}
      >
        <div className="wheel-pad" aria-hidden="true" />
        {items.map((item, i) => (
          <div
            key={item.value}
            className={`wheel-item ${value !== null && i === shownIndex ? "on" : ""}`}
            aria-hidden="true"
            onClick={() => pick(i)}
          >
            {item.label}
          </div>
        ))}
        <div className="wheel-pad" aria-hidden="true" />
      </div>
    </div>
  );
}
