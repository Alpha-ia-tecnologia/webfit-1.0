import { METHODS } from "../../lib/injection";
import type { InjectionMethod } from "../../types";
import { useRadioKeys } from "../useRadioKeys";
import { MethodArt } from "./MethodArt";

type Props = { method: InjectionMethod; onPick: (method: InjectionMethod) => void };
const METHOD_KEYS = METHODS.map((m) => m.key);

/** "Como você aplica?" (SERINGA-08): frasco e seringa, caneta com seletor ou caneta de dose única. */
export function MethodPicker({ method, onPick }: Props) {
  const keys = useRadioKeys(METHOD_KEYS, method, onPick);
  return (
    <section className="card inj-card" aria-labelledby="inj-method-title">
      <h2 id="inj-method-title">Como você aplica?</h2>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div className="inj-methods" role="radiogroup" aria-label="Como você aplica?" onKeyDown={keys.onKeyDown}>
        {METHODS.map((m) => {
          const isOn = m.key === method;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={isOn}
              aria-label={m.label}
              tabIndex={keys.tabIndex(m.key)}
              className={`inj-method ${isOn ? "on" : ""}`}
              onClick={() => onPick(m.key)}
            >
              <MethodArt method={m.key} />
              <strong>{m.label}</strong>
              <small>{m.hint}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
