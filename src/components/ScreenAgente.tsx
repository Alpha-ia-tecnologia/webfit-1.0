import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "../lib/context";
import {
  agentContext,
  dailyTargets,
  localDate,
  localTime,
  totalsFor,
  uid,
} from "../lib/domain";
import { layoutSections } from "../lib/agent-blocks";
import {
  chatSuggestions,
  PROFILE_ANALYSIS_REQUEST,
  type ChatSuggestion,
} from "../lib/agent-presentation";
import { isSensitive, waterBehind } from "../lib/day";
import { Page } from "./UI";
import { AgentAvatar, ContextButton, ContextPill } from "./agente/AgentHeader";
import { ChatDock } from "./agente/ChatDock";
import { ChatThread } from "./agente/ChatThread";
import { ContextSheet } from "./agente/ContextSheet";
import "./agente/Agente.css";

/** Chat em primeiro lugar: cabeçalho compacto, conversa na página inteira e barra fixa. */
export function ScreenAgente() {
  const {
    state,
    commit,
    notify,
    navigate,
    aiReady,
    aiRequest,
    aiBusy,
    aiStage,
    dietBusy,
    cancelAi,
    agentDraft,
    clearAgentDraft,
    setDate,
    editMeal,
    openEspaco,
  } = useApp();
  const [input, setInput] = useState(agentDraft),
    [sending, setSending] = useState(false),
    [isContextOpen, setContextOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null),
    hasScrolled = useRef(false);
  const closeContext = useCallback(() => setContextOpen(false), []);
  const p = state.profile!;
  const today = localDate();
  const totals = totalsFor(state.diary, today),
    goals = dailyTargets(state, today);
  const isLive = p.consentAi && aiReady;
  const canSend = isLive && !sending && !aiBusy;
  const statusText = !p.consentAi
    ? "Compartilhamento com IA desativado"
    : aiReady
      ? "Online · responde com seu contexto"
      : "Agente ainda não conectado";
  const time = localTime();
  // Os atalhos do app só aparecem quando a última resposta não trouxe as próprias sugestões.
  const last = state.messages[state.messages.length - 1];
  const hasAgentSuggestions =
    last?.sender === "ai" &&
    !!last.blocks?.length &&
    layoutSections(last.blocks, { sensitive: isSensitive(p), allergyDetails: p.allergyDetails })
      .suggestions.length > 0;
  const suggestions = hasAgentSuggestions
    ? []
    : chatSuggestions({
        time,
        hasPlan: !!state.dietPlan,
        waterBehind: waterBehind({ goals, profile: p, totals, time }) !== null,
        missingInformation: agentContext(state, today).missingInformation.length,
      });
  // A conversa abre na última mensagem (sem animação); as novas rolam suavemente.
  useEffect(() => {
    if (!state.messages.length && !aiBusy) return;
    end.current?.scrollIntoView({
      behavior: hasScrolled.current ? "smooth" : "auto",
      block: "end",
    });
    hasScrolled.current = true;
  }, [state.messages.length, aiBusy]);
  // A pergunta pronta vinda do Hoje entra na caixa uma vez; a pessoa revisa antes de enviar.
  useEffect(() => {
    if (agentDraft) clearAgentDraft();
  }, [agentDraft, clearAgentDraft]);
  const send = async (text: string, retryId?: string) => {
    if (!text.trim() || sending || aiBusy) return;
    setSending(true);
    const id = retryId ?? uid();
    if (
      !retryId &&
      !(await commit((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            id,
            sender: "user",
            text: text.trim(),
            timestamp: new Date().toISOString(),
            status: "sent",
          },
        ],
      })))
    ) {
      setSending(false);
      return;
    }
    // Pedido pronto (atalho, análise do perfil) não apaga o que a pessoa estava escrevendo.
    setInput((current) => (current.trim() === text.trim() ? "" : current));
    try {
      const { text: replyText, meta, structured } = await aiRequest(
        "chat",
        text,
      );
      // Blocos visuais só quando vieram válidos; o texto continua sendo o histórico.
      const blocks =
        structured?.kind === "chat" ? { blocks: structured.sections } : {};
      await commit((s) =>
        s.profile?.consentAi
          ? {
              ...s,
              messages: s.messages.flatMap((m) =>
                m.id === id
                  ? [
                      { ...m, status: "sent" as const },
                      {
                        id: uid(),
                        sender: "ai" as const,
                        text: replyText,
                        meta,
                        ...blocks,
                        timestamp: new Date().toISOString(),
                        status: "sent" as const,
                      },
                    ]
                  : [m],
              ),
            }
          : s,
      );
    } catch (error) {
      notify((error as Error).message, "warning");
      await commit((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === id ? { ...m, status: "error" as const } : m,
        ),
      }));
    } finally {
      setSending(false);
    }
  };
  const pickSuggestion = (suggestion: ChatSuggestion) => {
    if (suggestion.kind === "diet") navigate("dieta");
    else if (canSend) void send(suggestion.prompt);
    else setInput(suggestion.prompt);
  };
  /** Próxima pergunta sugerida numa resposta por blocos: envia, ou vai para a caixa se não der. */
  const pickBlockSuggestion = (text: string) => {
    if (canSend) void send(text);
    else setInput(text);
  };
  /** "+ → Analisar meu perfil": o pedido pronto vai pelo mesmo envio do chat (vira um aviso na conversa). */
  const analyzeProfile = () => {
    if (canSend) void send(PROFILE_ANALYSIS_REQUEST);
  };
  /** "+ → Foto do prato": Registrar refeição de hoje, com a análise pedida assim que a foto carregar. */
  const attachPhoto = (file: File) => {
    setDate(localDate());
    editMeal(null, { photo: file, analyze: true });
  };
  const empty = (
    <div className="chat-empty">
      <span className="chat-empty-art" aria-hidden="true">
        <Sparkles size={26} />
      </span>
      <h2>Vamos começar pelo que importa para você?</h2>
      <p>Toque em uma sugestão abaixo ou escreva sua pergunta.</p>
    </div>
  );
  return (
    <Page
      title="Meu agente"
      header={{
        lead: <AgentAvatar isLive={isLive} />,
        subtitle: statusText,
        actions: <ContextButton onOpen={() => setContextOpen(true)} />,
        hideBell: true,
      }}
    >
      <div className="agent-screen">
        {!p.consentAi && (
          <p className="notice agent-notice">
            Para conversar, autorize o compartilhamento do contexto em{" "}
            <button className="text-btn" onClick={() => navigate("espaco")}>
              Meu espaço
            </button>
            .
          </p>
        )}
        {p.consentAi && !aiReady && (
          <p className="notice agent-notice">
            A conexão com o provedor de IA ainda precisa ser configurada.
            Nenhuma resposta será simulada.
          </p>
        )}
        <ContextPill
          totals={totals}
          goals={goals}
          hideCalories={p.hideCalories}
          mealsPerDay={p.mealsPerDay}
        />
        <ChatThread
          messages={state.messages}
          today={today}
          hideCalories={p.hideCalories}
          currentPlanText={state.dietPlan?.text ?? null}
          canRetry={canSend}
          isTyping={aiBusy && !dietBusy}
          progress={aiStage}
          onRetry={(m) => void send(m.text, m.id)}
          onCancel={cancelAi}
          onOpenDiet={() => navigate("dieta")}
          onBlockSuggestion={pickBlockSuggestion}
          empty={empty}
        />
        {dietBusy && (
          <p className="chat-system">
            <Sparkles size={13} aria-hidden="true" />O agente está criando sua
            dieta.
            <button
              type="button"
              className="text-btn"
              onClick={() => navigate("dieta")}
            >
              Acompanhar
            </button>
          </p>
        )}
        <ChatDock
          value={input}
          onChange={setInput}
          onSubmit={(text) => void send(text)}
          canSend={canSend}
          suggestions={suggestions}
          onSuggestion={pickSuggestion}
          onVoiceError={(message) => notify(message, "info")}
          onAttachPhoto={attachPhoto}
          onOpenExams={() => openEspaco("documentos")}
          onOpenPantry={() => navigate("despensa")}
          onAnalyzeProfile={analyzeProfile}
        />
        <div ref={end} className="chat-end" />
      </div>
      {isContextOpen && <ContextSheet onClose={closeContext} />}
    </Page>
  );
}
