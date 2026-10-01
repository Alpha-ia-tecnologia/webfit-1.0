import { useEffect, useId, useRef, type RefObject } from "react";
import { ChevronDown, Package, Refrigerator } from "lucide-react";
import { plural } from "../../lib/format";
import {
  groupByLocation,
  PANTRY_EMPTY_TEXT,
  PANTRY_FILTER_EMPTY_TEXT,
  PANTRY_SORT_LABEL,
  type PantrySort,
} from "../../lib/pantry-view";
import type { PantryItem } from "../../types";
import { IconTile } from "../IconTile";
import { SearchField } from "../SearchField";
import { Empty } from "../UI";
import { PantryRow } from "./PantryRow";

const GROUP_ICON = {
  geladeira: { icon: Refrigerator, tone: "water" },
  despensa: { icon: Package, tone: "warn" },
} as const;
const SORTS: PantrySort[] = ["validade", "nome"];

interface Props {
  items: readonly PantryItem[];
  sort: PantrySort;
  onSort: (sort: PantrySort) => void;
  /** A busca abre pela lupa do cabeçalho; fechada, o campo não aparece. */
  isSearching: boolean;
  search: string;
  onSearch: (search: string) => void;
  /** Esc no campo: fecha a busca (limpa) e devolve o foco à lupa. */
  onCloseSearch: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  hide: boolean;
  isLocked: boolean;
  onEdit: (item: PantryItem) => void;
  onRemove: (item: PantryItem) => Promise<boolean>;
}

/** Meus alimentos (conceito 06): um cartão por local, vencidos no topo, ordem por validade ou nome. */
export function PantryInventory(props: Props) {
  const { items, sort, search, hide, isLocked, onEdit, onRemove } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<{ list: string; index: number } | null>(null);
  const sortId = useId();
  const groups = groupByLocation(items, sort, undefined, props.isSearching ? search : "");

  // Depois de remover (quando a linha já saiu da tela): o "⋯" da linha que ficou na mesma posição,
  // senão o da anterior, senão o título. Assim o foco não cai no <body>.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const menus = heading.current
      ?.closest(".pantry-inventory")
      ?.querySelector(`[data-list="${target.list}"]`)
      ?.querySelectorAll<HTMLButtonElement>(".overflow-menu > .icon-btn");
    const next = menus?.[target.index] ?? (target.index > 0 ? menus?.[target.index - 1] : undefined);
    (next ?? heading.current)?.focus();
  }, [items]);

  const remove = async (item: PantryItem, list: string, index: number) => {
    pendingFocus.current = { list, index };
    if (!(await onRemove(item))) pendingFocus.current = null;
  };

  return (
    <section className="pantry-inventory" aria-labelledby={`${sortId}-title`}>
      <div className="pantry-section-head">
        <h2 id={`${sortId}-title`} ref={heading} tabIndex={-1}>
          Meus alimentos
        </h2>
        {items.length > 0 && (
          <span className="pantry-section-count">{plural(items.length, "item", "itens")}</span>
        )}
      </div>
      {props.isSearching && (
        // Esc fecha a busca (o campo é compartilhado; a tecla sobe até aqui).
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- só escuta o Esc do campo
        <div
          className="pantry-search"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onCloseSearch();
            }
          }}
        >
          <SearchField
            label="Buscar nos meus alimentos"
            placeholder="Ex.: arroz, tomate…"
            value={search}
            inputRef={props.searchRef}
            onChange={props.onSearch}
          />
        </div>
      )}
      {!items.length ? (
        <Empty art="pantry">{PANTRY_EMPTY_TEXT}</Empty>
      ) : !groups.length ? (
        <Empty art="search" action={{ label: "Limpar busca", onClick: props.onCloseSearch }}>
          {PANTRY_FILTER_EMPTY_TEXT}
        </Empty>
      ) : (
        groups.map((group, g) => {
          const { icon, tone } = GROUP_ICON[group.location];
          const titleId = `${sortId}-${group.location}`;
          return (
            <section key={group.location} className="pantry-group" aria-labelledby={titleId}>
              <div className="pantry-group-head">
                <IconTile icon={icon} tone={tone} size="md" />
                <h3 id={titleId} className="pantry-group-title">
                  {group.label}
                </h3>
                <span className="pantry-group-count" aria-hidden="true">
                  {group.items.length}
                </span>
                {g === 0 && (
                  <span className="pantry-sort">
                    <label htmlFor={`${sortId}-sort`} className="sr-only">
                      Ordenar alimentos
                    </label>
                    <select
                      id={`${sortId}-sort`}
                      value={sort}
                      onChange={(event) => props.onSort(event.target.value as PantrySort)}
                    >
                      {SORTS.map((value) => (
                        <option key={value} value={value}>
                          {PANTRY_SORT_LABEL[value]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} aria-hidden="true" />
                  </span>
                )}
              </div>
              <ul
                className="pantry-rows"
                data-list={group.location}
                aria-label={group.label}
              >
                {group.items.map((item, index) => (
                  <PantryRow
                    key={item.id}
                    item={item}
                    hide={hide}
                    isLocked={isLocked}
                    onEdit={() => onEdit(item)}
                    onRemove={() => void remove(item, group.location, index)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
