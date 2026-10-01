import { MacroStat } from "../MacroStat";

export type MacroValue = {
  key: string;
  label: string;
  value: number;
  goal: number | null;
  percent: number | null;
};

/** Proteína, carbos e gorduras do dia: o mesmo bloco no Hoje e no Diário (com barras no Diário). */
export function MacroSummary({ macros, showBars = false }: { macros: MacroValue[]; showBars?: boolean }) {
  return (
    <div className={`day-macros ${showBars ? "with-bars" : ""}`}>
      {macros.map((m) => (
        <MacroStat
          key={m.key}
          macro={m.key}
          label={m.label}
          value={m.value}
          goal={m.goal}
          percent={m.percent}
          showBar={showBars}
        />
      ))}
    </div>
  );
}
