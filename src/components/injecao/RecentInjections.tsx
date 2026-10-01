import type { CSSProperties, RefObject } from "react";
import { Info } from "lucide-react";
import { fmtDayMonth } from "../../lib/format";
import { recentInjectionText, recentSummary, shortSpotLabel, type RecentInjection } from "../../lib/injection";
import type { Spot } from "../../lib/rotation";
import type { InjectionEntry } from "../../types";
import { BodyMapMini } from "./BodyMapMini";
import "./Recipe.css";

type NoticeProps = {
  recent: RecentInjection;
  today: string;
  onDismiss: () => void;
  onOpen: (entry: InjectionEntry) => void;
};

/** Aviso gentil de aplicação recente ou duplicada: tom neutro de atenção e nunca bloqueia. */
export function RecentNotice({ recent, today, onDismiss, onOpen }: NoticeProps) {
  return (
    <div className="inj-recent-warning" role="status">
      <Info size={18} aria-hidden="true" />
      <div>
        <p>{recentInjectionText(recent, today)}</p>
        <div className="inj-recent-warning-actions">
          <button type="button" className="text-btn" onClick={onDismiss}>
            É outra aplicação
          </button>
          <button type="button" className="text-btn" onClick={() => onOpen(recent.entry)}>
            Ver o registro
          </button>
        </div>
      </div>
    </div>
  );
}

type StripProps = {
  injections: readonly InjectionEntry[];
  today: string;
  /** Frequência informada (aplicações por mês): "semanais" no subtítulo. */
  perMonth: number | null | undefined;
  /** Próxima aplicação estimada (só quando a pessoa acompanha a frequência) e o local sugerido. */
  next: { date: string; spot: Spot } | null;
  onSeeAll: () => void;
  /** Recebe o foco quando a folha "Aplicação registrada" fecha. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
};

/**
 * "Últimas aplicações" (conceito 10): faixa com as três últimas (data, há quanto tempo, miniatura do
 * local e o nome curto) e, para quem acompanha a frequência, a próxima estimada em verde tracejado.
 * Registros sem lado acendem a zona inteira: nada inventado.
 */
export function RecentStrip({ injections, today, perMonth, next, onSeeAll, headingRef }: StripProps) {
  const { items, subtitle } = recentSummary(injections, today, perMonth);
  if (!items.length) return null;
  return (
    <section className="card inj-card inj-strip-card" aria-labelledby="inj-recent-title">
      <div className="inj-strip-head">
        <div>
          <h2 id="inj-recent-title" ref={headingRef} tabIndex={-1}>
            Últimas aplicações
          </h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="inj-strip-all" onClick={onSeeAll}>
          Ver todas
        </button>
      </div>
      <ul className="inj-strip" aria-label="Últimas aplicações" style={{ "--strip-cols": items.length + (next ? 1 : 0) } as CSSProperties}>
        {items.map((item, i) => (
          <li key={item.entry.id}>
            <strong className="inj-strip-date">{item.dateLabel}</strong>
            <span className="inj-strip-ago">{item.agoLabel}</span>
            <BodyMapMini
              framed
              tone={i === items.length - 1 ? "last" : "past"}
              site={item.entry.site}
              side={item.entry.side ?? null}
              prefix="Local"
            />
            <span className="inj-strip-site" aria-hidden="true">
              {item.shortLabel}
            </span>
          </li>
        ))}
        {next && (
          <li className="is-next">
            <strong className="inj-strip-date">{fmtDayMonth(next.date)}</strong>
            <span className="inj-strip-ago">
              próxima<span className="sr-only"> estimada</span>
            </span>
            <BodyMapMini framed tone="next" site={next.spot.site} side={next.spot.side} prefix="Local sugerido" />
            <span className="inj-strip-site" aria-hidden="true">
              {shortSpotLabel(next.spot.site, next.spot.side)}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
