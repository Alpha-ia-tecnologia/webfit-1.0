import { useState, type CSSProperties } from "react";
import { useApp } from "../../lib/context";
import { signalChip, type InsightChip, type InsightSheetAction, type InsightSheetModel } from "../../lib/day";
import { localDate } from "../../lib/domain";
import { activeSignals, dismissSignal, type SignalScreen } from "../../lib/signals";
import { INSIGHT_ICONS, InsightSheet } from "./InsightSheet";
import "./Insights.css";

type Props = {
  /** Só os chips com folha aparecem; os de contexto (água, combinado, despensa) ficam no Resumo. */
  chips: InsightChip[];
  /** Nome acessível do grupo. */
  label?: string;
  onAction: (action: InsightSheetAction) => void;
  onDismiss: (key: string) => void;
};

/**
 * Linha horizontal de chips de insight (ícone 16 px + título curto, 32 px): o toque abre a
 * InsightSheet com a frase, a ação e "Dispensar". Sem kicker em caixa alta, sem parágrafo na tela.
 */
export function InsightChips({ chips, label = "Observado nos seus registros", onAction, onDismiss }: Props) {
  const [open, setOpen] = useState<InsightSheetModel | null>(null);
  const items = chips.filter((chip) => chip.sheet);
  if (items.length === 0) return null;
  return (
    <>
      <div className="signal-chips" role="group" aria-label={label} data-testid="insight-chips">
        {items.map((chip, index) => {
          const sheet = chip.sheet!;
          const Icon = INSIGHT_ICONS[sheet.tone];
          return (
            <button
              key={sheet.id}
              type="button"
              className={`signal-chip is-${sheet.tone}`}
              style={{ "--i": index } as CSSProperties}
              data-signal={sheet.id}
              aria-haspopup="dialog"
              title={chip.full !== chip.text ? chip.full : undefined}
              onClick={() => setOpen(sheet)}
            >
              <Icon size={16} aria-hidden="true" />
              {chip.text}
            </button>
          );
        })}
      </div>
      {open && (
        <InsightSheet
          sheet={open}
          onAction={(action) => {
            setOpen(null);
            onAction(action);
          }}
          onDismiss={(key) => {
            setOpen(null);
            onDismiss(key);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * Os sinais ativos da tela (signals.ts) como chips, logo abaixo do cabeçalho: a ação abre Meu agente
 * com a pergunta pronta; dispensar pausa o sinal por 3 dias; perfis calmos nunca veem nada.
 */
export function ScreenInsightChips({ screen }: { screen: SignalScreen }) {
  const { state, commit, askAgent, navigate } = useApp();
  const today = localDate();
  const chips = activeSignals(state, today, screen).map(signalChip);
  if (chips.length === 0) return null;
  return (
    <InsightChips
      chips={chips}
      onAction={(action) => {
        if (action.kind === "agent") askAgent(action.prompt);
        else if (action.kind === "chat") navigate("agente");
      }}
      onDismiss={(key) => void commit((s) => dismissSignal(s, key, today))}
    />
  );
}
