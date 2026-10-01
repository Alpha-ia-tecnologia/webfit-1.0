import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useApp } from "../../lib/context";
import { MEAL_TEXT_COPY, MEAL_TEXT_MAX_CHARS, type MealText } from "../../lib/meal-text";
import { maskStructured } from "../../lib/structured";
import { visiblePlainText } from "../../lib/text";
import { AiProgress } from "../AiProgress";
import { Modal } from "../UI";
import { MealTextDraft } from "./MealTextDraft";
import type { MealTextSelection } from "./useMealText";
import "./MealText.css";

const MIN_CHARS = 3;
/** Cada estado leva o foco ao que acabou de aparecer (texto, aviso ou espera). */
const focusOnMount = (element: HTMLElement | null) => {
  element?.focus();
};

type Outcome =
  | { kind: "draft"; id: number; draft: MealText; source: string }
  | { kind: "urgent"; text: string }
  | { kind: "text"; text: string };

/**
 * "Descrever refeição" (DIARIO-07, web): a pessoa escreve (ou dita pelo teclado do aparelho) o que
 * comeu e o agente organiza os itens (modo "meal_text"). O texto só sai do aparelho no toque em
 * "Organizar itens", com autorização e agente conectado. Alerta de urgência fica na folha, sem
 * itens; resposta só em texto vira um aviso para buscar os alimentos na tela.
 */
export function MealTextSheet({
  onClose,
  onAdd,
  onSearch,
}: {
  onClose: () => void;
  onAdd: (selections: MealTextSelection[]) => void;
  onSearch: (name: string) => void;
}) {
  const { state, aiReady, aiBusy, aiStage, aiRequest, cancelAi, notify } = useApp();
  const profile = state.profile!;
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isSending, setSending] = useState(false);
  const drafts = useRef(0);
  const mounted = useRef(true);
  /** Pedido desta folha ainda em andamento (null: nenhum). */
  const pending = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Saiu da tela sem "Fechar" (ex.: a refeição remontou): o pedido não fica ocupando o agente.
      if (pending.current) cancelAi();
    };
  }, [cancelAi]);
  const baseId = useId();
  const isBlocked = !aiReady || !profile.consentAi;
  const trimmed = text.trim();
  const canOrganize = trimmed.length >= MIN_CHARS && !isBlocked && !aiBusy;

  const organize = async () => {
    if (!canOrganize) return;
    // A quantidade só vale se o trecho estiver neste texto, exatamente o enviado.
    const sent = trimmed;
    const request = Symbol("meal_text");
    pending.current = request;
    setSending(true);
    setOutcome(null);
    try {
      const reply = await aiRequest("meal_text", sent);
      if (!mounted.current) return;
      if (reply.meta.urgency === "imediata") {
        setOutcome({ kind: "urgent", text: reply.text });
      } else if (reply.structured?.kind === "meal_text") {
        drafts.current += 1;
        setOutcome({
          kind: "draft",
          id: drafts.current,
          draft: maskStructured(reply.structured.draft, profile.hideCalories, { plain: true }),
          source: sent,
        });
      } else {
        setOutcome({ kind: "text", text: visiblePlainText(reply.text, profile.hideCalories) });
      }
      if (reply.meta.notes.length) notify(reply.meta.notes.join(" "), "info");
    } catch (err) {
      // Erro: volta ao texto, que continua ali.
      if (mounted.current) notify((err as Error).message, "warning");
    } finally {
      if (pending.current === request) pending.current = null;
      if (mounted.current) setSending(false);
    }
  };
  /** Cancela o pedido desta folha (e só ele). */
  const cancelOwn = () => {
    pending.current = null;
    cancelAi();
  };
  // Fechar no meio do pedido cancela o pedido desta folha.
  const close = () => {
    if (isSending) cancelOwn();
    onClose();
  };

  const fieldId = `${baseId}-field`;
  const hintId = `${baseId}-hint`;
  const countId = `${baseId}-count`;
  let body: ReactNode;
  if (outcome?.kind === "draft")
    body = (
      <MealTextDraft
        key={outcome.id}
        draft={outcome.draft}
        source={outcome.source}
        allergyDetails={profile.allergyDetails}
        onAdd={onAdd}
        onSearch={onSearch}
        onBack={() => setOutcome(null)}
      />
    );
  else if (isSending)
    body = (
      <div ref={focusOnMount} tabIndex={-1}>
        <AiProgress
          title={MEAL_TEXT_COPY.busy}
          mode="meal_text"
          progress={aiStage}
          onCancel={cancelOwn}
        />
      </div>
    );
  else
    body = (
      <>
        {outcome?.kind === "urgent" && (
          <div ref={focusOnMount} tabIndex={-1} role="alert" className="notice exam-urgent">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>{outcome.text}</p>
          </div>
        )}
        {outcome?.kind === "text" && (
          <div ref={focusOnMount} tabIndex={-1} className="notice whitespace-pre-wrap">
            {outcome.text}
            <p className="hint">{MEAL_TEXT_COPY.textOnly}</p>
          </div>
        )}
        <form
          className="meal-text-form"
          onSubmit={(e) => {
            e.preventDefault();
            void organize();
          }}
        >
          <div className="field">
            <label htmlFor={fieldId}>{MEAL_TEXT_COPY.field}</label>
            <textarea
              id={fieldId}
              ref={outcome ? undefined : focusOnMount}
              rows={4}
              maxLength={MEAL_TEXT_MAX_CHARS}
              value={text}
              placeholder={MEAL_TEXT_COPY.placeholder}
              aria-describedby={`${hintId} ${countId}`}
              data-autofocus
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <p id={countId} className="meal-text-count" aria-live="off">
            {text.length}/{MEAL_TEXT_MAX_CHARS}
          </p>
          <p id={hintId} className="hint">
            {MEAL_TEXT_COPY.hint}
          </p>
          <p className="hint">{MEAL_TEXT_COPY.keyboardHint}</p>
          <p className="hint">{MEAL_TEXT_COPY.privacy}</p>
          {isBlocked && <p className="notice">{MEAL_TEXT_COPY.blocked}</p>}
          <div className="meal-text-actions">
            <button type="submit" className="btn" disabled={!canOrganize}>
              <Sparkles size={16} aria-hidden="true" />
              {aiBusy ? "Aguarde…" : MEAL_TEXT_COPY.organize}
            </button>
            <button type="button" className="btn-secondary" onClick={close}>
              Cancelar
            </button>
          </div>
        </form>
      </>
    );
  return (
    <Modal title={MEAL_TEXT_COPY.title} onClose={close}>
      {body}
    </Modal>
  );
}
