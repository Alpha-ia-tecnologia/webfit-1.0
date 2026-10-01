import { useDeferredValue, useMemo, useState } from "react";
import { useApp } from "../../lib/context";
import { searchDiary, type DiarySearchHit } from "../../lib/diary-day";
import { localDate } from "../../lib/domain";
import { humanDate } from "../../lib/today";
import { Modal } from "../UI";
import { SearchField } from "../SearchField";

const MIN_CHARS = 2;

/** Lupa do Diário (DIARIO-02): busca em todos os dias; escolher um resultado abre o dia dele. */
export function DiarySearch({ onPick, onClose }: { onPick: (hit: DiarySearchHit) => void; onClose: () => void }) {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const groups = useMemo(
    () => searchDiary(state.diary, state.injections, deferred),
    [state.diary, state.injections, deferred],
  );
  const count = groups.reduce((total, group) => total + group.hits.length, 0);
  const isSearching = deferred.replace(/\s/g, "").length >= MIN_CHARS;
  const today = localDate();
  return (
    <Modal title="Buscar no diário" onClose={onClose}>
      {/* O modal abre com o foco na busca (data-autofocus), não no "Fechar". */}
      <SearchField
        label="Buscar em todo o diário"
        placeholder="Alimento, água, bem-estar…"
        value={query}
        onChange={setQuery}
        isAutofocus
      />
      <p className="sr-only" role="status">
        {isSearching ? `${count} ${count === 1 ? "resultado" : "resultados"}` : ""}
      </p>
      {!isSearching ? (
        <p className="hint">Digite pelo menos 2 letras para buscar em todos os dias.</p>
      ) : !count ? (
        <p className="hint">Nada encontrado no diário.</p>
      ) : (
        <div className="diary-search-results">
          {groups.map((group) => (
            <section key={group.date} aria-label={humanDate(group.date, today)}>
              <h3>{humanDate(group.date, today)}</h3>
              <ul>
                {group.hits.map((hit) => (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button type="button" className="diary-search-hit" onClick={() => onPick(hit)}>
                      <span className="diary-row-time">{hit.time}</span>
                      <span className="diary-search-copy">
                        <strong>{hit.title}</strong>
                        <span>{hit.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
