import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUp,
  Camera,
  ClipboardList,
  Droplets,
  FileText,
  History,
  Mic,
  Plus,
  Refrigerator,
  ScanSearch,
  Square,
  Utensils,
} from "lucide-react";
import type { ChatSuggestion } from "../../lib/agent-presentation";
import { OverflowMenu } from "../OverflowMenu";

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((e: {
        results: { [key: number]: { [key: number]: { transcript: string } } };
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export const MAX_INPUT = 6000;
const COUNTER_FROM = MAX_INPUT * 0.8;

function suggestionIcon(suggestion: ChatSuggestion) {
  if (suggestion.kind === "diet") return Utensils;
  if (/água/i.test(suggestion.label)) return Droplets;
  if (/anamnese/i.test(suggestion.label)) return ClipboardList;
  if (/registros/i.test(suggestion.label)) return History;
  return Utensils;
}

/**
 * Barra fixa do chat (conceito 05): "+" redondo (foto do prato, exame, despensa, análise do perfil), o campo em
 * pílula com o ditado dentro, à direita, e o envio redondo. Os atalhos do app só aparecem quando a
 * última resposta não trouxe sugestões; o aviso de revisão fica em "O que o agente considera".
 */
export function ChatDock({
  value,
  onChange,
  onSubmit,
  canSend,
  suggestions,
  onSuggestion,
  onVoiceError,
  onAttachPhoto,
  onOpenExams,
  onOpenPantry,
  onAnalyzeProfile,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  canSend: boolean;
  suggestions: ChatSuggestion[];
  onSuggestion: (suggestion: ChatSuggestion) => void;
  onVoiceError: (message: string) => void;
  /** Foto do prato escolhida pelo "+": vai para Registrar refeição (nunca para a conversa). */
  onAttachPhoto: (file: File) => void;
  onOpenExams: () => void;
  onOpenPantry: () => void;
  /** "+" → Analisar meu perfil: envia o pedido pronto; só habilitado quando dá para enviar (canSend). */
  onAnalyzeProfile: () => void;
}) {
  const [isRecording, setRecording] = useState(false);
  const voice = useRef<Recognition | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const Voice =
    (window as VoiceWindow).SpeechRecognition ??
    (window as VoiceWindow).webkitSpeechRecognition;
  useEffect(() => () => voice.current?.abort(), []);
  // O campo volta à altura inicial quando a mensagem é enviada (valor limpo).
  useEffect(() => {
    if (!value && box.current) box.current.style.height = "";
  }, [value]);
  const toggleVoice = () => {
    if (!Voice) return;
    if (isRecording) {
      voice.current?.stop();
      return;
    }
    const recognition = new Voice();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.onresult = (e) =>
      onChange(
        `${box.current?.value ?? ""} ${e.results[0][0].transcript}`.trim(),
      );
    recognition.onerror = () => {
      setRecording(false);
      onVoiceError(
        "O ditado não está disponível ou a permissão foi recusada. Digite sua mensagem.",
      );
    };
    recognition.onend = () => setRecording(false);
    voice.current = recognition;
    try {
      recognition.start();
      setRecording(true);
    } catch {
      onVoiceError("Não foi possível iniciar o ditado.");
    }
  };
  const resize = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  };
  return (
    <div className="chat-dock">
      {suggestions.length > 0 && (
        <div className="prompt-pills chat-shortcuts" role="group" aria-label="Sugestões">
          {suggestions.map((suggestion) => {
            const Icon = suggestionIcon(suggestion);
            return (
              <button
                key={suggestion.label}
                type="button"
                className={`prompt-pill reply${suggestion.kind === "diet" ? " diet" : ""}`}
                onClick={() => onSuggestion(suggestion)}
              >
                <Icon size={16} aria-hidden="true" />
                {suggestion.label}
              </button>
            );
          })}
        </div>
      )}
      {value.length >= COUNTER_FROM && (
        <p className="chat-counter">
          {value.length}/{MAX_INPUT}
        </p>
      )}
      <form
        className="chat-dock-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <OverflowMenu
          icon={Plus}
          label="Mais opções do chat"
          placement="top-start"
          className="chat-plus"
          items={[
            {
              label: "Foto do prato",
              icon: Camera,
              onSelect: () => photoInput.current?.click(),
            },
            { label: "Exame", icon: FileText, onSelect: onOpenExams },
            { label: "Despensa", icon: Refrigerator, onSelect: onOpenPantry },
            {
              label: "Analisar meu perfil",
              icon: ScanSearch,
              disabled: !canSend,
              onSelect: onAnalyzeProfile,
            },
          ]}
        />
        <input
          ref={photoInput}
          className="chat-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onAttachPhoto(file);
          }}
        />
        <div className="chat-field">
          <textarea
            ref={box}
            aria-label="Mensagem para o agente"
            aria-describedby={hintId}
            placeholder="Pergunte ao seu agente…"
            rows={1}
            maxLength={MAX_INPUT}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              resize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canSend) {
                e.preventDefault();
                onSubmit(value);
              }
            }}
          />
          {Voice && (
            <button
              type="button"
              className={`icon-btn chat-mic${isRecording ? " recording" : ""}`}
              aria-label={isRecording ? "Parar ditado" : "Ditar mensagem"}
              onClick={toggleVoice}
            >
              {isRecording ? <Square size={18} /> : <Mic size={20} />}
            </button>
          )}
        </div>
        <button
          className="chat-send"
          aria-label="Enviar mensagem"
          disabled={!value.trim() || !canSend}
        >
          <ArrowUp size={20} />
        </button>
      </form>
      <p id={hintId} className="sr-only">
        Enter envia; Shift+Enter quebra linha.
        {Voice ? " O ditado usa o reconhecimento de voz do navegador." : ""}
      </p>
    </div>
  );
}
