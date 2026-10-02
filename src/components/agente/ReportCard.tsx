import { useId, type CSSProperties } from "react";
import {
  ChevronDown,
  Eye,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  ThumbsUp,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import {
  describeAgentMetaFull,
  describeAgentMetaShort,
  type ProfileReport,
  type ReportSection,
  type ReportSectionKey,
} from "../../lib/agent-presentation";
import type { AgentMeta } from "../../types";
import { IconTile } from "../IconTile";
import { QuickReplies } from "./ChatBlocks";
import "./ReportCard.css";

const SECTION_ICON: Record<ReportSectionKey, LucideIcon> = {
  well: ThumbsUp,
  attention: Eye,
  suggestions: Utensils,
  talk: Stethoscope,
};

/** Cor do ponto de cada item: o fg do tom da seção (tokens --wf-tone-*). */
const toneStyle = (section: ReportSection) =>
  ({ "--report-fg": `var(--wf-tone-${section.tone}-fg)` } as CSSProperties);

/** Uma seção do relatório: linha com tile de 32 px, título, contagem e seta; itens com ponto ou chips. */
function Section({ section, isOpen }: { section: ReportSection; isOpen: boolean }) {
  const count = section.items.length;
  return (
    <details className="report-section" open={isOpen} style={toneStyle(section)}>
      <summary className="report-row">
        <IconTile tone={section.tone} icon={SECTION_ICON[section.key]} className="report-tile" />
        <span className="report-title">{section.title}</span>
        <span className="report-count">
          {count}
          <span className="sr-only"> {count === 1 ? "item" : "itens"}</span>
        </span>
        <ChevronDown size={16} className="report-chevron" aria-hidden="true" />
      </summary>
      {section.key === "suggestions" ? (
        <ul className="report-chips">
          {section.items.map((item, index) => (
            <li key={index} className="report-chip">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="report-items">
          {section.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

/**
 * Resposta ao "Analisar meu perfil" como cartão (conceito 05, "Boa semana!"): selo "Análise do
 * perfil" com a hora, a síntese como título, as 4 seções recolhíveis (a primeira aberta) com tile
 * de ícone, itens com ponto colorido ou chips, e o rodapé com a revisão automática. Só desenha o
 * que os blocos já limpos trazem: nada de calorias, números do corpo ou dose escondidos volta aqui.
 */
export function ReportCard({
  report,
  time,
  meta,
  isLatest,
  onSuggestion,
}: {
  report: ProfileReport;
  time: string;
  meta: AgentMeta | undefined;
  isLatest: boolean;
  onSuggestion: (text: string) => void;
}) {
  const titleId = useId();
  return (
    <>
      <section className="report-card" data-testid="report-card" aria-labelledby={titleId}>
        <header className="report-head">
          <p className="report-kicker">
            <span className="report-badge">
              <Sparkles size={12} aria-hidden="true" />
              Análise do perfil
            </span>
            <time className="report-time">· {time}</time>
          </p>
          <h4 id={titleId} className="report-summary">
            {report.summary}
          </h4>
        </header>
        <div className="report-sections">
          {report.sections.map((section, index) => (
            <Section key={section.key} section={section} isOpen={index === 0} />
          ))}
        </div>
        {meta && (
          <footer className="report-foot" title={describeAgentMetaFull(meta)}>
            <ShieldCheck size={14} aria-hidden="true" />
            <span aria-hidden="true">{describeAgentMetaShort(meta)}</span>
            <span className="sr-only">{describeAgentMetaFull(meta)}</span>
          </footer>
        )}
      </section>
      {isLatest && (
        <QuickReplies suggestions={report.suggestions} options={[]} onSuggestion={onSuggestion} />
      )}
    </>
  );
}
