import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import {
  choiceLayout,
  choiceName,
  choiceSections,
  choiceText,
  composeChoices,
  filterChoices,
  parseChoices,
  splitChoices,
  toggleChoice,
  type ChoiceConfig,
  type ChoiceOption,
} from "./inputs";
import { CHOICE_ICON } from "./icons";
import { OptionalTag } from "./OptionalTag";
import type { AboutSlot } from "./StageAbout";
import { Modal } from "../UI";

type Props = {
  id: string;
  name: string;
  label: string;
  /** Pergunta exibida no lugar do rótulo ("Tem algum diagnóstico de saúde?"). */
  prompt?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value: string;
  config: ChoiceConfig;
  /** "ⓘ Por quê?" da etapa (só na 1ª pergunta). */
  about?: AboutSlot;
  onChange: (value: string) => void;
};

/**
 * Escolhas (única ou múltipla) com "Outros". Listas sem descrição viram pílulas compactas com ícone:
 * excludentes ("Nenhuma", "Prefiro não informar") lado a lado no topo e, quando marcadas, recolhem
 * as demais; as 8 primeiras opções ficam à vista e o resto abre em "Ver mais N", com busca.
 * O valor gravado continua sendo texto: opções separadas por vírgula mais o texto livre.
 */
export function ChoiceChips({
  id,
  name,
  label,
  prompt,
  hint,
  error,
  optional,
  value,
  config,
  about,
  onChange,
}: Props) {
  const parsed = parseChoices(value, config);
  // "Outros" aberto: há texto livre salvo ou a pessoa abriu o campo para escrever.
  const [isOtherRequested, setOtherRequested] = useState(false);
  const [isExpanded, setExpanded] = useState(false);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const commonRow = useRef<HTMLDivElement>(null);
  const focusCommon = useRef(false);
  useEffect(() => {
    if (!isExpanded || !focusCommon.current) return;
    focusCommon.current = false;
    commonRow.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [isExpanded]);
  // Lista fechada (hideOther): sem "Outros"; texto fora da lista não abre campo livre.
  const hasOther = !config.hideOther;
  const isOtherOpen = hasOther && (parsed.other !== "" || isOtherRequested);
  const isPills = choiceLayout(config) === "pills";
  const isMulti = config.mode === "multi";
  const helpId = hint || error ? `${id}-help` : undefined;
  const otherId = `${id}-other`;
  const otherLabel = config.otherLabel ?? "Outros";
  const pick = (option: ChoiceOption) => {
    const next = toggleChoice(parsed.selected, option, config);
    const other = config.mode === "single" || !hasOther ? "" : parsed.other;
    if (config.mode === "single") setOtherRequested(false);
    if (option.none && !parsed.selected.includes(option.value)) setExpanded(false);
    onChange(composeChoices(next, other, config));
  };
  // O campo mostra o texto como digitado (o espaço no fim incluído); o valor gravado é o aparado. Só volta
  // ao gravado quando ele muda por fora (outra opção marcada, texto reconhecido como opção).
  const [otherText, setOtherText] = useState(parsed.other);
  useEffect(() => {
    setOtherText((text) => (text.trim() === parsed.other ? text : parsed.other));
  }, [parsed.other]);
  const writeOther = (text: string) => {
    setOtherText(text);
    onChange(
      composeChoices(
        config.mode === "single" ? [] : parsed.selected,
        text,
        config,
      ),
    );
  };
  const toggleOther = () => {
    if (isOtherOpen) {
      writeOther("");
      setOtherRequested(false);
    } else setOtherRequested(true);
  };
  const chip = (option: ChoiceOption, index: number) => {
    const isOn = parsed.selected.includes(option.value);
    const hintId = option.hint ? `${id}-hint-${index}` : undefined;
    const Icon = option.icon ? CHOICE_ICON[option.icon] : null;
    // Marcada, a pílula troca o ícone pelo ✓ num círculo claro.
    const showIcon = Icon && !isOn;
    return (
      <button
        key={option.value}
        type="button"
        className={[
          "choice-chip",
          isPills ? "is-pill" : "",
          isMulti ? "is-multi" : "",
          isOn ? "on" : "",
          option.none ? "none" : "",
          Icon ? "has-icon" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={isOn}
        aria-label={choiceName(option)}
        aria-describedby={hintId}
        onClick={() => pick(option)}
      >
        {showIcon ? (
          <Icon className="choice-icon" size={18} aria-hidden="true" />
        ) : (
          <span className="choice-check" aria-hidden="true">
            {isOn && <Check size={12} strokeWidth={3} />}
          </span>
        )}
        {option.emoji && (
          <span className="choice-emoji" aria-hidden="true">
            {option.emoji}
          </span>
        )}
        <span className="choice-text">
          <span>{choiceText(option)}</span>
          {option.hint && <small id={hintId}>{option.hint}</small>}
        </span>
      </button>
    );
  };
  const otherChip = hasOther && (
    <button
      type="button"
      className={`choice-chip other ${isPills ? "is-pill" : ""} ${isOtherOpen ? "on" : ""}`}
      aria-pressed={isOtherOpen}
      aria-label={otherLabel}
      aria-controls={otherId}
      onClick={toggleOther}
    >
      <span className="choice-check" aria-hidden="true">
        <Plus size={isPills ? 16 : 12} strokeWidth={isPills ? 2.25 : 3} />
      </span>
      <span className="choice-text">
        <span>{otherLabel}</span>
      </span>
    </button>
  );
  const { exclusive, visible, hidden } = splitChoices(config, parsed.selected);
  const common = [...visible, ...hidden];
  const isExclusiveOn = exclusive.some((option) =>
    parsed.selected.includes(option.value),
  );
  // Recolhe só quando não há outra resposta marcada (respostas antigas nunca ficam escondidas).
  const hasCommonOn = common.some((option) =>
    parsed.selected.includes(option.value),
  );
  const showCommon = !isExclusiveOn || isExpanded || hasCommonOn;
  const pills = (
    <div className="choice-pills">
      {exclusive.length > 0 && (
        <div className="choice-pill-row is-exclusive">
          {exclusive.map(chip)}
        </div>
      )}
      {exclusive.length > 0 && showCommon && (
        <p className="choice-divider" aria-hidden="true">
          ou escolha
        </p>
      )}
      {showCommon && config.sections ? (
        <div className="choice-sections" ref={commonRow}>
          {choiceSections(config, visible).map((section, index) => {
            const titleId = `${id}-section-${index}`;
            return (
              <div
                key={section.title ?? "rest"}
                className="choice-section"
                role={section.title ? "group" : undefined}
                aria-labelledby={section.title ? titleId : undefined}
              >
                {section.title && (
                  <p id={titleId} className="choice-section-title">
                    {section.title}
                  </p>
                )}
                <div className="choice-pill-row">
                  {section.options.map((option) =>
                    chip(option, config.options.indexOf(option)),
                  )}
                </div>
              </div>
            );
          })}
          {otherChip && <div className="choice-pill-row">{otherChip}</div>}
        </div>
      ) : showCommon ? (
        <div className="choice-pill-row" ref={commonRow}>
          {visible.map(chip)}
          {hidden.length > 0 && (
            <button
              type="button"
              className="choice-chip is-pill choice-more"
              aria-haspopup="dialog"
              onClick={() => {
                setQuery("");
                setSheetOpen(true);
              }}
            >
              <span className="choice-text">
                <span>Ver mais {hidden.length}</span>
              </span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
          )}
          {otherChip}
        </div>
      ) : (
        <button
          type="button"
          className="text-btn choice-expand"
          onClick={() => {
            // O botão some ao expandir: o foco vai para a primeira opção revelada.
            focusCommon.current = true;
            setExpanded(true);
          }}
        >
          Mostrar outras opções
        </button>
      )}
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
      <div className="q-head is-stacked">
        <span id={`${id}-label`} className="q-label">
          {prompt ?? label}
          {prompt && prompt !== label && (
            <span className="sr-only"> ({label})</span>
          )}
          {optional && <OptionalTag />}
        </span>
        <p className="q-help">
          <span>{isMulti ? "Marque todos que se aplicam" : "Escolha uma"}</span>
          {about && (
            <>
              <span className="q-help-dot" aria-hidden="true">
                ·
              </span>
              {about.button}
            </>
          )}
        </p>
      </div>
      {about?.panel}
      {isPills ? (
        pills
      ) : (
        <div className="choice-grid">
          {config.options.map(chip)}
          {otherChip}
        </div>
      )}
      {isOtherOpen && (
        <input
          id={otherId}
          className="choice-other"
          type="text"
          maxLength={500}
          placeholder={config.otherPlaceholder ?? "Descreva com suas palavras"}
          aria-label={`${label}: outros`}
          value={otherText}
          onChange={(e) => writeOther(e.target.value)}
        />
      )}
      <input
        className="q-mirror"
        name={name}
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {helpId && (
        <p
          id={helpId}
          className={error ? "field-error" : "hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </p>
      )}
      {isSheetOpen && (
        <Modal title={label} onClose={() => setSheetOpen(false)}>
          <label className="choice-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Buscar opção"
              aria-label={`Buscar em ${label}`}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="choice-pill-row choice-sheet-list">
            {filterChoices(common, query).map(chip)}
          </div>
          {!filterChoices(common, query).length && (
            <p className="hint">Nenhuma opção encontrada. Use "{otherLabel}".</p>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => setSheetOpen(false)}
          >
            Concluir
          </button>
        </Modal>
      )}
    </div>
  );
}
