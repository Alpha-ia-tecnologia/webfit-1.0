import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import { dismissSignal, signalFor, type SignalScreen } from "../../lib/signals";
import { SignalCard } from "./SignalCard";

/**
 * Sinal do app na tela (no máximo um, signals.ts): leitura dos últimos dias com uma pergunta
 * pronta para o agente. Dispensar pausa o sinal por 3 dias; perfis calmos nunca veem nada.
 */
export function ScreenSignal({ screen }: { screen: SignalScreen }) {
  const { state, commit, askAgent } = useApp();
  const today = localDate();
  const signal = signalFor(state, today, screen);
  if (!signal) return null;
  const action = signal.action;
  return (
    <SignalCard
      tone={signal.tone}
      kicker="Observado nos seus registros"
      title={signal.title}
      testId="signal-card"
      dataId={signal.id}
      dismissLabel="Dispensar por 3 dias"
      onDismiss={() => void commit((s) => dismissSignal(s, signal.id, today))}
      action={action ? { label: action.label, onPress: () => askAgent(action.prompt) } : undefined}
    >
      <p>{signal.body}</p>
    </SignalCard>
  );
}
