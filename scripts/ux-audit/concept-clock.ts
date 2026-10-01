// Relógio dos conceitos: o dia da proposta visual (qui, 24 set 2026, fuso de São Paulo) e a troca de
// Date usada para montar os estados como se fosse esse dia. Compartilhado por concept-state.ts e
// concept-ai.ts (scripts/ux-audit/capture-concepts.ts).
import { withGlobals } from "../../tests/fixtures";

/** Dia dos conceitos ("Qui, 24 set"); o navegador da captura roda com o relógio neste dia. */
export const CONCEPT_DAY = "2026-09-24";
export const OFFSET = "-03:00";

/** Horário local dos conceitos em ISO (timestamps de mensagens, registros e receitas). */
export const iso = (date: string, time: string) => new Date(`${date}T${time}:00${OFFSET}`).toISOString();

/** Troca Date durante a montagem: localDate() e as validações leem o dia dos conceitos. */
function frozenDate(now: number): DateConstructor {
  const Real = Date;
  function Frozen(this: unknown, ...args: unknown[]) {
    const value: Date = args.length ? Reflect.construct(Real, args) : new Real(now);
    return new.target ? value : value.toString();
  }
  Frozen.prototype = Real.prototype;
  Object.setPrototypeOf(Frozen, Real);
  (Frozen as unknown as { now: () => number }).now = () => now;
  return Frozen as unknown as DateConstructor;
}
export const atConceptDay = <T>(run: () => T): T =>
  withGlobals({ Date: frozenDate(Date.parse(`${CONCEPT_DAY}T12:00:00${OFFSET}`)) }, run);
