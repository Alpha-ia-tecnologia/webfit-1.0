/** Um horário do plano na faixa do cabeçalho: feita, a próxima ou os demais (sem cobrança). */
export interface PlanStep {
  time: string;
  state: "done" | "next" | "other";
}

/**
 * Linha "2 de 5 refeições hoje" do cabeçalho do dia (fidelidade "Minha dieta"): a contagem, o
 * consumido de hoje (kcal do diário, sem ela com calorias ocultas) e um segmento por refeição com o
 * horário. Nunca vermelho; perfis calmos só veem os horários (quem usa decide: `count` null).
 */
export function PlanProgress({
  count,
  kcal,
  steps,
}: {
  /** "2 de 5 refeições hoje"; null = sem contagem (perfil calmo). */
  count: string | null;
  /** "930 de 1.645 kcal"; null com calorias ocultas ou sem meta. */
  kcal: string | null;
  steps: readonly PlanStep[];
}) {
  return (
    <div className="plan-day-progress">
      {count && (
        <p className="plan-day-progress-head">
          <strong data-testid="plan-progress">{count}</strong>
          {kcal && <span>{kcal}</span>}
        </p>
      )}
      <ol className="plan-day-steps" aria-hidden="true">
        {steps.map((step, index) => (
          <li key={`${step.time}-${index}`} className={`is-${step.state}`}>
            <span className="plan-day-seg" />
            <span className="plan-day-time">{step.time}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
