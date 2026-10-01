import "./Meal.css";

/** Estado de um dia na semana de um combinado (habitWeek em lib/habit-week.ts, lote Hoje). */
export type WeekDotState = "done" | "missed" | "today" | "future" | "before";

type Props = {
  /** 7 estados, de segunda a domingo. */
  states: readonly WeekDotState[];
  /** Nome acessível ("3 de 4 dias nesta semana"): sem sequência, sem cobrança. */
  label: string;
};

/**
 * 7 pontos de 6 px (seg–dom) ao lado do subtítulo de um combinado. Feito = verde; perdido = cinza
 * cheio (nunca vermelho); hoje pendente = aro; futuro ou antes de criado = aro claro. Não usar em
 * perfil calmo (a tela decide).
 */
export function WeekDots({ states, label }: Props) {
  return (
    <span className="week-dots" role="img" aria-label={label}>
      {states.map((state, i) => (
        <i key={i} className={`is-${state}`} />
      ))}
    </span>
  );
}
