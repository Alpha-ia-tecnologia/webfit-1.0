import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import {
  chatSuggestions,
  PROFILE_ANALYSIS_REQUEST,
  type ChatSuggestion,
} from "@shared/lib/agent-presentation";
import { SETTINGS_TAB } from "@shared/lib/copy";
import { layoutSections } from "@shared/lib/agent-blocks";
import { isSensitive, waterBehind } from "@shared/lib/day";
import {
  agentContext,
  dailyTargets,
  localDate,
  localTime,
  totalsFor,
  uid,
} from "@shared/lib/domain";
import { bodyNumbers } from "@shared/lib/space";
import { AgentAvatar, ContextButton, ContextPill } from "@/components/agente/agent-header";
import { ChatDock, MAX_INPUT } from "@/components/agente/chat-dock";
import { ChatThread, SystemChip } from "@/components/agente/chat-thread";
import { ContextSheet } from "@/components/agente/context-sheet";
import { AppHeader } from "@/components/layout/app-header";
import { AppText, Button, LiveAnnouncement, Notice } from "@/components/ui";
import { AGENT_OFFLINE } from "@shared/lib/agent-stream";
import { AGENT_NOT_CONFIGURED } from "@/lib/api";
import { espacoHref } from "@/lib/espaco-link";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

const SCROLL_DELAY_MS = 80;
/**
 * A barra de abas fica no fluxo, logo abaixo desta tela (já com a área segura); só o botão "+",
 * que sobe ~26 px sobre ela, precisa de folga abaixo do rodapé da barra do chat.
 */
const DOCK_BOTTOM_SPACE = 28;
const CONSENT_MESSAGE = `Para enviar mensagens, autorize o compartilhamento com a IA em Meu espaço › ${SETTINGS_TAB.label}.`;

function EmptyChat() {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyArt} aria-hidden>
        <Sparkles size={26} color={colors.green700} />
      </View>
      <AppText heading size={fontSize.lg} weight={700} align="center">
        Vamos começar pelo que importa para você?
      </AppText>
      <AppText size={fontSize.sm} color={colors.text2} align="center">
        Toque em uma sugestão abaixo ou escreva sua pergunta.
      </AppText>
    </View>
  );
}

/** Chat em primeiro lugar: cabeçalho compacto, conversa na página inteira e barra fixa. */
export function AgenteScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const {
    state,
    commit,
    notify,
    aiReady,
    aiRequest,
    aiBusy,
    aiStage,
    aiProviders,
    dietBusy,
    cancelAi,
    apiError,
    refreshAgent,
    agentDraft,
    clearAgentDraft,
    setDate,
    editMeal,
  } = useApp();
  const router = useRouter();
  const [input, setInput] = useState(agentDraft);
  const [isSending, setSending] = useState(false);
  const [isChecking, setChecking] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isContextOpen, setContextOpen] = useState(false);
  // Cada abertura remonta o painel (o Modal do web desmonta): o detalhe do compartilhamento volta fechado.
  const [contextSheetKey, setContextSheetKey] = useState(0);
  // Aviso da chegada de uma resposta; a hora muda o texto, então respostas seguidas também são anunciadas.
  const [replyNotice, setReplyNotice] = useState("");
  const sending = useRef(false);
  const hasScrolled = useRef(false);
  const scroller = useRef<ScrollView>(null);
  const p = state.profile!;
  const today = localDate();
  const time = localTime();
  const totals = totalsFor(state.diary, today);
  const goals = dailyTargets(state, today);
  const isLive = p.consentAi && aiReady;
  const canSend = !isSending && !aiBusy && !isChecking;
  const connectionMessage = !p.consentAi
    ? CONSENT_MESSAGE
    : !aiReady
      ? (apiError ??
        "Aguardando conexão com o servidor da IA. Toque em Verificar conexão para tentar novamente.")
      : null;
  const statusText = !p.consentAi
    ? "Compartilhamento com IA desativado"
    : aiReady
      ? "Online · responde com seu contexto"
      : "Agente ainda não conectado";
  // Os atalhos do app só aparecem quando a última resposta não trouxe as próprias sugestões (conceito 05).
  const last = state.messages[state.messages.length - 1];
  const hasAgentSuggestions =
    last?.sender === "ai" &&
    !!last.blocks?.length &&
    layoutSections(last.blocks, { sensitive: isSensitive(p), allergyDetails: p.allergyDetails }).suggestions.length > 0;
  const suggestions = hasAgentSuggestions
    ? []
    : chatSuggestions({
        time,
        hasPlan: !!state.dietPlan,
        waterBehind: waterBehind({ goals, profile: p, totals, time }) !== null,
        missingInformation: agentContext(state, today).missingInformation.length,
      });
  const openPreferences = () => router.push(espacoHref("preferencias"));
  const openContext = () => {
    setContextSheetKey((key) => key + 1);
    setContextOpen(true);
  };

  // A pergunta pronta vinda do Hoje entra na caixa uma vez (a aba pode já estar montada); a pessoa revisa antes de enviar.
  useEffect(() => {
    if (!agentDraft) return;
    setInput(agentDraft);
    clearAgentDraft();
  }, [agentDraft, clearAgentDraft]);

  // A conversa abre na última mensagem (sem animação); as novas rolam suavemente.
  useEffect(() => {
    const timer = setTimeout(() => {
      scroller.current?.scrollToEnd({ animated: hasScrolled.current });
      hasScrolled.current = true;
    }, SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.messages.length, aiBusy, dietBusy]);

  useEffect(() => {
    setSendError(null);
  }, [aiReady, p.consentAi]);

  const verifyConnection = async () => {
    if (isChecking || sending.current || aiBusy) return;
    setChecking(true);
    setSendError(null);
    try {
      const status = await refreshAgent();
      if (!status.ready) setSendError(AGENT_NOT_CONFIGURED);
      else notify("Conexão restabelecida. Você já pode enviar sua mensagem.");
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Não foi possível conectar ao agente.",
      );
    } finally {
      setChecking(false);
    }
  };

  const send = async (text: string, retryId?: string) => {
    if (!text.trim() || sending.current || !canSend) return;
    setSendError(null);
    if (!p.consentAi) {
      setSendError(CONSENT_MESSAGE);
      return;
    }
    sending.current = true;
    setSending(true);
    const id = retryId ?? uid();
    let saved = !!retryId;
    try {
      // Uma falha anterior não deve bloquear o botão até a próxima consulta automática.
      if (!aiReady && !(await refreshAgent()).ready)
        throw new Error(AGENT_NOT_CONFIGURED);
      if (!retryId) {
        let added = false;
        saved = await commit((s) => {
          if (!s.profile?.consentAi) return s;
          added = true;
          return {
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
          };
        });
        saved = saved && added;
        if (!saved) {
          setSendError(
            "Não foi possível salvar a mensagem. Seu texto foi mantido; confira suas preferências e tente novamente.",
          );
          return;
        }
        setInput((current) => (current.trim() === text.trim() ? "" : current));
      }
      const reply = await aiRequest("chat", text);
      const { text: replyText, meta } = reply;
      // Blocos visuais só quando vieram válidos; sem eles a conversa segue em texto, como antes.
      const blocks =
        reply.structured?.kind === "chat" ? { blocks: reply.structured.sections } : {};
      let replied = false;
      const isReplySaved = await commit((s) => {
        if (!s.profile?.consentAi) return s;
        replied = true;
        return {
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
        };
      });
      // Como o role=log do web, mas só a chegada é anunciada (a conversa não vira região viva).
      if (isReplySaved && replied)
        setReplyNotice(`Nova resposta do agente às ${localTime()}`);
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a mensagem. Tente novamente.",
      );
      if (saved)
        await commit((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, status: "error" as const } : m,
          ),
        }));
    } finally {
      sending.current = false;
      setSending(false);
    }
  };

  // Atalhos enviam direto quando o agente está disponível; senão, entram na caixa para revisão.
  const pickSuggestion = (suggestion: ChatSuggestion) => {
    if (suggestion.kind === "diet") router.push("/dieta");
    else if (isLive && canSend) void send(suggestion.prompt);
    else setInput(suggestion.prompt);
  };
  // Sugestão de próxima pergunta vinda da própria resposta: mesma regra dos atalhos.
  const pickBlockSuggestion = (text: string) => {
    if (isLive && canSend) void send(text);
    else setInput(text);
  };
  // "+ → Analisar meu perfil": o pedido pronto vai pelo mesmo envio (vira um aviso na conversa).
  const analyzeProfile = () => {
    if (isLive && canSend) void send(PROFILE_ANALYSIS_REQUEST);
  };
  // "+ → Foto do prato": refeição nova de hoje com a foto; a análise começa sozinha quando o agente puder.
  const attachPhoto = (photo: string) => {
    setDate(localDate());
    editMeal(null, { photo, analyze: true });
  };

  const notice =
    sendError || connectionMessage ? (
      <View
        testID="agent-send-notice"
        style={styles.sendNotice}
        accessibilityLiveRegion="polite"
      >
        <AppText size={fontSize.xs} lineHeight={17} color={colors.text2}>
          {sendError || connectionMessage}
        </AppText>
        <View style={styles.noticeActions}>
          {/* Com o agente online, um erro vindo da própria resposta não pede reconfigurar a conexão. */}
          {(!p.consentAi || !aiReady || sendError === AGENT_OFFLINE) && (
            <Button
              label={p.consentAi ? "Configurar conexão" : "Abrir preferências"}
              variant="text"
              onPress={openPreferences}
            />
          )}
          {p.consentAi && !aiReady ? (
            <Button
              label={isChecking ? "Verificando…" : "Verificar conexão"}
              variant="text"
              disabled={!canSend}
              onPress={() => void verifyConnection()}
            />
          ) : null}
        </View>
      </View>
    ) : isSending && !aiBusy ? (
      <AppText
        size={fontSize.xs}
        color={colors.muted}
        accessibilityLiveRegion="polite"
      >
        Verificando conexão e preparando envio…
      </AppText>
    ) : null;

  return (
    <View style={styles.root}>
      {/* Conceito 05: avatar e status no próprio cabeçalho, "O que o agente considera" no lugar do sino. */}
      <AppHeader
        variant="large"
        title="Meu agente"
        lead={<AgentAvatar isLive={isLive} />}
        subtitle={statusText}
        actions={<ContextButton isOpen={isContextOpen} onOpen={openContext} />}
        hideBell
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scroller}
          style={styles.root}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!p.consentAi ? (
            <Notice>
              <AppText size={fontSize.sm} lineHeight={21} color={colors.green800}>
                Para conversar, autorize o compartilhamento do contexto em Meu
                espaço.
              </AppText>
              <Button
                label="Abrir Meu espaço"
                variant="text"
                onPress={() => router.push("/espaco")}
              />
            </Notice>
          ) : null}
          {p.consentAi && !aiReady ? (
            <Notice>
              A conexão com o servidor do agente ainda não está disponível.
              Nenhuma resposta será simulada.
            </Notice>
          ) : null}
          <ContextPill
            totals={totals}
            goals={goals}
            hideCalories={p.hideCalories}
            mealsPerDay={p.mealsPerDay}
          />
          <LiveAnnouncement message={replyNotice} />
          <ChatThread
            messages={state.messages}
            today={today}
            hideCalories={p.hideCalories}
            hideBodyNumbers={bodyNumbers(p, today) === "hidden"}
            currentPlanText={state.dietPlan?.text ?? null}
            canRetry={canSend}
            isTyping={aiBusy && !dietBusy}
            progress={aiStage}
            onRetry={(m) => void send(m.text, m.id)}
            onCancel={cancelAi}
            onOpenDiet={() => router.push("/dieta")}
            onBlockSuggestion={pickBlockSuggestion}
            empty={<EmptyChat />}
          />
          {dietBusy ? (
            <SystemChip>
              <AppText size={fontSize.xs} weight={600} color={colors.text2}>
                O agente está criando sua dieta.
              </AppText>
              <Button
                label="Acompanhar"
                variant="text"
                onPress={() => router.push("/dieta")}
              />
            </SystemChip>
          ) : null}
        </ScrollView>
        <ChatDock
          value={input}
          onChange={setInput}
          onSubmit={(text) => void send(text)}
          canSend={canSend}
          canDictate={isLive && canSend}
          suggestions={suggestions}
          onSuggestion={pickSuggestion}
          onTranscript={(text) =>
            setInput((current) =>
              (current ? `${current} ${text}` : text).slice(0, MAX_INPUT),
            )
          }
          onVoiceError={(message) => notify(message, "warning")}
          notice={notice}
          paddingBottom={DOCK_BOTTOM_SPACE}
          onAttachPhoto={attachPhoto}
          onOpenExams={() => router.push(espacoHref("documentos"))}
          onOpenPantry={() => router.push("/despensa")}
          onAnalyzeProfile={analyzeProfile}
          canAnalyze={isLive && canSend}
        />
      </KeyboardAvoidingView>
      <ContextSheet
        key={contextSheetKey}
        visible={isContextOpen}
        state={state}
        providers={aiProviders}
        onClose={() => setContextOpen(false)}
        onManage={() => {
          setContextOpen(false);
          openPreferences();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyArt: {
    width: 56,
    height: 56,
    marginBottom: 4,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint100,
  },
  sendNotice: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 2,
    backgroundColor: colors.surface2,
  },
  noticeActions: { flexDirection: "row", flexWrap: "wrap", columnGap: 16 },
}));
