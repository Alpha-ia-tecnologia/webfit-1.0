import { Fragment, useMemo, type ReactNode } from "react";
import {
  layoutSections,
  renderBlock,
  SECTION_LABEL,
  suggestionEmoji,
  weekCardLayout,
  type ChatBlock,
  type WeekCardView,
} from "../../lib/agent-blocks";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { isSensitive } from "../../lib/day";
import { maskStructured } from "../../lib/structured";
import type { ChatMessage } from "../../types";
import { RichText } from "../RichText";
import { useBodyNumbersHidden } from "../useBodyNumbersHidden";
import { ActionCard } from "./ActionCard";
import { BlockChart } from "./BlockChart";
import { MealChoice } from "./MealOptions";
import { WeekSummaryCard } from "./WeekSummaryCard";
import "./ChatBlocks.css";

type Run =
  | { kind: "bubble"; key: number; blocks: ChatBlock[] }
  | { kind: "card"; key: number; block: ChatBlock };

/**
 * Texto e listas seguidos dividem um parágrafo (blocos crus: o RichText desenha a pílula das
 * calorias ocultas); cartões usam a cópia já mascarada, alinhada pelo índice.
 */
function groupBlocks(raw: readonly ChatBlock[], plain: readonly ChatBlock[]): Run[] {
  return raw.reduce<Run[]>((runs, block, index) => {
    if (block.tipo !== "texto" && block.tipo !== "lista")
      return [...runs, { kind: "card", key: index, block: plain[index] ?? block }];
    const last = runs[runs.length - 1];
    if (last?.kind === "bubble")
      return [...runs.slice(0, -1), { ...last, blocks: [...last.blocks, block] }];
    return [...runs, { kind: "bubble", key: index, blocks: [block] }];
  }, []);
}

/**
 * Resposta do agente desenhada por blocos (SIS-02). Os dados são mascarados uma vez na entrada
 * (hideCalories): rótulos, nomes acessíveis e avisos derivados já nascem sem calorias. Com o
 * resumo da semana, o texto curto vira o título do cartão e os combinados e sugestões viram os
 * chips dele. Sem blocos válidos para este perfil, o texto de sempre.
 */
export function ChatBlocks({
  message,
  isLatest,
  onSuggestion,
  footer,
}: {
  message: ChatMessage;
  isLatest: boolean;
  onSuggestion: (text: string) => void;
  /** Linha de revisão e avisos, entre os blocos e as respostas rápidas. */
  footer?: ReactNode;
}) {
  const { state } = useApp();
  const profile = state.profile!;
  const sensitive = isSensitive(profile);
  const hide = profile.hideCalories;
  const allergyDetails = profile.allergyDetails;
  const layout = useMemo(
    () => weekCardLayout(layoutSections(message.blocks ?? [], { sensitive, allergyDetails })),
    [message.blocks, sensitive, allergyDetails],
  );
  const hideBody = useBodyNumbersHidden();
  const plain = useMemo(
    () => maskStructured(layout, hide, { plain: true, hideBodyNumbers: hideBody }),
    [layout, hide, hideBody],
  );
  const endDate = localDate(new Date(message.timestamp));
  const options = plain.sections.flatMap((s) =>
    s.blocos.flatMap((b) => (b.tipo === "opcoes_refeicao" ? b.opcoes : [])),
  );
  if (!layout.sections.length)
    return (
      <>
        <div className="chat-bubble">
          <RichText text={message.text} hideCalories={hide} />
        </div>
        {footer}
      </>
    );
  const renderCard = (block: ChatBlock, week: WeekCardView | null) => {
    switch (block.tipo) {
      case "opcoes_refeicao":
        return <MealChoice block={block} sensitive={sensitive} messageId={message.id} />;
      case "grafico":
        if (block.metrica === "semana_7d")
          return week ? (
            <WeekSummaryCard
              endDate={endDate}
              title={week.title}
              habits={week.habits}
              suggestions={week.suggestions}
              onSuggestion={onSuggestion}
            />
          ) : null;
        return <BlockChart metric={block.metrica} />;
      case "acao":
        return <ActionCard block={block} />;
      default:
        return null;
    }
  };
  return (
    <>
      {layout.sections.map((section, index) => {
        const isWeek = plain.week?.section === index;
        return (
          <section key={index} className="chat-section">
            {section.papel && !isWeek && (
              <h3 className="chat-section-label">{SECTION_LABEL[section.papel]}</h3>
            )}
            {groupBlocks(section.blocos, plain.sections[index]?.blocos ?? section.blocos).map(
              (run) =>
                run.kind === "bubble" ? (
                  <div key={run.key} className="chat-bubble">
                    <RichText
                      text={run.blocks.map(renderBlock).join("\n\n")}
                      hideCalories={hide}
                    />
                  </div>
                ) : (
                  <Fragment key={run.key}>
                    {renderCard(run.block, isWeek ? plain.week : null)}
                  </Fragment>
                ),
            )}
          </section>
        );
      })}
      {footer}
      {isLatest && plain.suggestions.length > 0 && (
        <div
          className="prompt-pills chat-suggestions"
          role="group"
          aria-label="Sugestões do agente"
        >
          {plain.suggestions.map((suggestion) => {
            const emoji = suggestionEmoji(suggestion, options);
            return (
              <button
                key={suggestion}
                type="button"
                className="prompt-pill reply"
                onClick={() => onSuggestion(suggestion)}
              >
                {emoji && (
                  <span className="prompt-pill-emoji" aria-hidden="true">
                    {emoji}
                  </span>
                )}
                {suggestion}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
