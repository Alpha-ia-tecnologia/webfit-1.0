import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Mic, Square } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";

const FAILED = "Não foi possível reconhecer a fala. Tente novamente ou digite a mensagem.";
/** Erros que não são falha: a pessoa parou ou não falou nada. */
const SILENT_ERRORS = new Set(["aborted", "no-speech"]);

type Props = {
  /** Recebe o texto final reconhecido. */
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

/**
 * Ditado em pt-BR com o reconhecedor do sistema; substitui a Web Speech API do app web.
 * Reage apenas às sessões que ele mesmo iniciou: a aba do agente continua montada enquanto a pessoa
 * dita em "Descrever refeição", e aquele texto não pode cair no rascunho do chat.
 */
export function VoiceButton({ onTranscript, onError, disabled = false }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isAvailable, setAvailable] = useState(false);
  const [isRecording, setRecording] = useState(false);
  const isMine = useRef(false);

  useEffect(() => {
    try {
      setAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable());
    } catch {
      setAvailable(false);
    }
  }, []);
  // Desmontar no meio do ditado encerra a escuta.
  useEffect(
    () => () => {
      if (!isMine.current) return;
      isMine.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Sem sessão ativa: nada a encerrar.
      }
    },
    [],
  );
  useSpeechRecognitionEvent("start", () => {
    if (isMine.current) setRecording(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (!isMine.current) return;
    isMine.current = false;
    setRecording(false);
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (!isMine.current) return;
    const transcript = event.results[0]?.transcript?.trim();
    if (event.isFinal && transcript) onTranscript(transcript);
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!isMine.current) return;
    isMine.current = false;
    setRecording(false);
    if (!SILENT_ERRORS.has(event.error)) onError(FAILED);
  });

  if (!isAvailable) return null;

  const toggle = async () => {
    if (isRecording) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      onError("Permita o uso do microfone para ditar mensagens.");
      return;
    }
    isMine.current = true;
    try {
      ExpoSpeechRecognitionModule.start({ lang: "pt-BR", interimResults: false, continuous: false, addsPunctuation: true });
    } catch {
      // Sem sessão aberta: o botão não pode ficar "dono" e voltar a ouvir as sessões de outra tela.
      isMine.current = false;
      onError(FAILED);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Parar ditado" : "Ditar mensagem"}
      accessibilityState={{ disabled, selected: isRecording }}
      disabled={disabled}
      onPress={() => void toggle()}
      style={({ pressed }) => [styles.button, isRecording && styles.recording, disabled && styles.disabled, pressed && styles.pressed]}
    >
      {isRecording ? <Square size={16} color={colors.white} /> : <Mic size={19} color={colors.text2} />}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  /** Dentro do campo, à direita (conceito 05): sem fundo até gravar. */
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: "transparent", alignItems: "center", justifyContent: "center" },
  recording: { backgroundColor: colors.rose600 },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.94 }] },
}));
