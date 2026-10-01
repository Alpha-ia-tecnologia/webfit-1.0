import type { Ref } from "react";
import { Search, X } from "lucide-react";
import "./Controls.css";

/**
 * Campo de busca único (SIS-08): lupa, texto e "Limpar busca" quando há algo digitado.
 * `size="lg"` é o da busca de alimentos (58 px); o padrão serve às buscas em folhas.
 */
export function SearchField({
  label,
  value,
  onChange,
  onClear,
  placeholder,
  size = "md",
  isAutofocus = false,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Padrão: esvaziar o campo. */
  onClear?: () => void;
  placeholder?: string;
  size?: "md" | "lg";
  /** O modal que contém o campo abre com o foco nele (data-autofocus). */
  isAutofocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={`search-field search-field-${size}`}>
      <Search size={size === "lg" ? 20 : 16} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        data-autofocus={isAutofocus ? "" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" aria-label="Limpar busca" onClick={onClear ?? (() => onChange(""))}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
