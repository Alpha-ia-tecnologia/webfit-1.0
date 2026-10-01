import { dateBlock } from "../../lib/appointments";
import "./DateBlock.css";

type Props = {
  /** AAAA-MM-DD. */
  date: string;
  /** lg: próxima consulta (64 px) · sm: linhas da agenda (44 px). */
  size: "lg" | "sm";
  /**
   * plain: "qua / 30 / set" num bloco azul-claro (agenda) ·
   * band: faixa verde com o mês em cima, dia grande e dia da semana ("SET / 29 / TER", conceito 11).
   */
  variant?: "plain" | "band";
};

/** Bloco de data decorativo: a leitura completa vai em texto (oculto ou visível) ao lado. */
export function DateBlock({ date, size, variant = "plain" }: Props) {
  const block = dateBlock(date);
  if (variant === "band")
    return (
      <span className={`date-block is-band is-${size}`} aria-hidden="true">
        <span className="date-block-band">{block.month}</span>
        <strong>{block.day}</strong>
        <span>{block.weekday}</span>
      </span>
    );
  return (
    <span className={`date-block is-${size}`} aria-hidden="true">
      <span>{block.weekday}</span>
      <strong>{block.day}</strong>
      <span>{block.month}</span>
    </span>
  );
}
