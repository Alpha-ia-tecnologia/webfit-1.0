import { THEME_COPY, THEME_PREFS } from "../../lib/theme";
import { Modal } from "../UI";
import { useRadioKeys } from "../useRadioKeys";
import { useThemePref } from "../useThemePref";
import "./Appearance.css";

/**
 * "Aparência" (HOJE-X2): Sistema, Claro ou Escuro, só para este aparelho. A escolha vale na hora
 * (clique ou setas); sem aviso, porque andar pelas opções empilharia três.
 */
export function AppearanceSheet({ onClose }: { onClose: () => void }) {
  const [pref, setPref] = useThemePref();
  const keys = useRadioKeys(THEME_PREFS, pref, setPref);
  return (
    <Modal
      title={THEME_COPY.title}
      onClose={onClose}
      className="settings-sheet appearance-sheet"
    >
      <p className="hint">{THEME_COPY.hint}</p>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div
        className="theme-options"
        role="radiogroup"
        aria-label={THEME_COPY.group}
        onKeyDown={keys.onKeyDown}
      >
        {THEME_PREFS.map((option) => {
          const isOn = option === pref;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isOn}
              aria-label={THEME_COPY.options[option]}
              aria-describedby={`theme-${option}-hint`}
              tabIndex={keys.tabIndex(option)}
              className={`theme-option${isOn ? " on" : ""}`}
              onClick={() => setPref(option)}
            >
              <span className={`theme-swatch is-${option}`} aria-hidden="true" />
              <span className="theme-option-text">
                <strong>{THEME_COPY.options[option]}</strong>
                <small id={`theme-${option}-hint`}>{THEME_COPY.details[option]}</small>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
