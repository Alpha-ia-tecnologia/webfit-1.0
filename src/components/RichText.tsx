import { Clock, EyeOff, Info, Users, Utensils } from "lucide-react";
import {
  parseRichText,
  type RichBlock,
  type RichInline,
  type RichSection,
} from "../lib/rich-text";
import { visibleText } from "../lib/text";
import { useBodyNumbersHidden } from "./useBodyNumbersHidden";
import "./RichText.css";

type Props = {
  text: string;
  hideCalories: boolean;
  /** "cards" desenha cada seção com título (ex.: uma receita) como um sub-cartão. */
  variant?: "plain" | "cards";
  className?: string;
  testId?: string;
};

function metaIcon(label: string) {
  if (/tempo|preparo|minuto/i.test(label)) return Clock;
  if (/rendimento|porç|serve/i.test(label)) return Users;
  if (/refeiç/i.test(label)) return Utensils;
  return Info;
}

function Inlines({ parts }: { parts: RichInline[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "strong" ? (
          <strong key={i}>{part.text}</strong>
        ) : part.kind === "hidden" ? (
          <span
            key={i}
            className="rich-hidden"
            title="Calorias ocultas pela sua preferência"
          >
            <EyeOff size={12} aria-hidden="true" />
            calorias ocultas
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function Block({ block }: { block: RichBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <h4 className="rich-heading">
          <Inlines parts={block.inlines} />
        </h4>
      );
    case "paragraph":
      return (
        <p>
          <Inlines parts={block.inlines} />
        </p>
      );
    case "bullets":
      return (
        <ul className="rich-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines parts={item} />
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="rich-steps" start={block.start}>
          {block.items.map((item, i) => (
            <li key={i} data-step={block.start + i}>
              <Inlines parts={item} />
            </li>
          ))}
        </ol>
      );
    case "meta":
      return (
        <ul className="rich-meta">
          {block.items.map((item, i) => {
            const Icon = metaIcon(item.label);
            return (
              <li key={i}>
                <Icon size={14} aria-hidden="true" />
                <span className="rich-meta-label">{item.label}:</span>{" "}
                <Inlines parts={item.value} />
              </li>
            );
          })}
        </ul>
      );
  }
}

function Section({ section, asCard }: { section: RichSection; asCard: boolean }) {
  const body = section.blocks.map((block, i) => <Block key={i} block={block} />);
  if (!section.title) return <>{body}</>;
  return (
    <section className={asCard ? "rich-section card-like" : "rich-section"}>
      <h3 className="rich-title">
        <Inlines parts={section.title} />
      </h3>
      {body}
    </section>
  );
}

/**
 * Texto do agente com títulos, listas, passos e metadados desenhados, sem interpretar HTML. Com
 * "Ocultar números do corpo" no perfil, peso, IMC e medidas viram "número oculto" em toda tela.
 */
export function RichText({
  text,
  hideCalories,
  variant = "plain",
  className,
  testId,
}: Props) {
  const hideBody = useBodyNumbersHidden();
  const sections = parseRichText(visibleText(text, hideCalories, hideBody));
  const titled = sections.filter((s) => s.title).length;
  return (
    <div
      className={["rich-text", className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      {sections.map((section, i) => (
        <Section
          key={i}
          section={section}
          asCard={variant === "cards" && titled > 0}
        />
      ))}
    </div>
  );
}
