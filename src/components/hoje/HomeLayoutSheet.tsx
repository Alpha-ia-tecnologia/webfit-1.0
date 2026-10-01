import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useApp } from "../../lib/context";
import {
  moveHomeSection,
  parseHomeLayout,
  serializeHomeLayout,
  toggleHomeSection,
  type HomeSection,
  type HomeSectionKey,
} from "../../lib/home-layout";
import { Modal } from "../UI";

/**
 * "Editar Hoje" (HOJE-01): subir, descer e ocultar as seções abaixo dos anéis.
 * Salva em profile.homeLayout; "Desfazer" devolve a ordem anterior. Seções que não se aplicam
 * (medicação sem caneta) ficam fora da lista, guardadas no fim da ordem.
 */
export function HomeLayoutSheet({
  unavailable = [],
  onClose,
}: {
  unavailable?: readonly HomeSectionKey[];
  onClose: () => void;
}) {
  const { state, commit } = useApp();
  const [sections, setSections] = useState<HomeSection[]>(() => parseHomeLayout(state.profile?.homeLayout));
  const [busy, setBusy] = useState(false);
  const shown = sections.filter((s) => !unavailable.includes(s.key));
  const kept = sections.filter((s) => unavailable.includes(s.key));
  const update = (next: HomeSection[]) => setSections([...next, ...kept]);
  const save = async () => {
    const next = serializeHomeLayout(sections);
    let before: string | null = null;
    setBusy(true);
    const isSaved = await commit(
      (s) => {
        if (!s.profile) return s;
        before = s.profile.homeLayout;
        return { ...s, profile: { ...s.profile, homeLayout: next } };
      },
      "Hoje reorganizado.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) => (s.profile && before !== null ? { ...s, profile: { ...s.profile, homeLayout: before } } : s),
            "Ordem anterior restaurada.",
          ),
      },
    );
    setBusy(false);
    if (isSaved) onClose();
  };
  return (
    <Modal title="Editar Hoje" onClose={onClose}>
      <div className="stack">
        <p className="muted">A semana, os anéis e o resumo do dia ficam sempre no topo.</p>
        <ol className="home-layout-list">
          {shown.map((section, i) => (
            <li key={section.key} className={`home-layout-item ${section.isHidden ? "is-hidden" : ""}`}>
              <input
                type="checkbox"
                className="switch"
                checked={!section.isHidden}
                aria-label={`Mostrar ${section.label}`}
                onChange={() => update(toggleHomeSection(shown, section.key))}
              />
              <span className="home-layout-name">{section.label}</span>
              <span className="home-layout-moves">
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={`Subir ${section.label}`}
                  disabled={i === 0}
                  onClick={() => update(moveHomeSection(shown, section.key, -1))}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={`Descer ${section.label}`}
                  disabled={i === shown.length - 1}
                  onClick={() => update(moveHomeSection(shown, section.key, 1))}
                >
                  <ArrowDown size={16} />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => setSections(parseHomeLayout(""))}>
            Ordem padrão
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
