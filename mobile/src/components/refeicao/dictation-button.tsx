import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Mic, Square } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable } from "react-native";
import { LiveAnnouncement } from "@/components/ui";
import { onDeviceDictation } from "@/lib/dictation";
import { makeStyles, useThemeColors } from "@/theme/theme";

const LISTENING = "Ouvindo…";
const UNAVAILABLE = "O ditado no aparelho não está disponível. Use o microfone do teclado.";
const NOT_ALLOWED = "Permita o microfone para ditar, ou use o teclado.";
const FAILED = "Não foi possível reconhecer a fala. Tente de novo ou digite.";
/** Erros que não são falha: a pessoa parou ou não falou nada. */
const SILENT_ERRORS = new Set(["aborted", "no-speech"]);
const GONE_ERRORS = new Set(["language-not-supported", "service-not-allowed"]);

/**
 * O ditado só no aparelho está disponível? Começa false e só vira true depois da verificação
 * (no export web é sempre false: fica o microfone do teclado do sistema).
 */
export function useOnDeviceDictation(): [boolean, (value: boolean) => void] {
  const [isAvailable, setAvailable] = useState(false);
  useEffect(() => {
    let isActive = true;
    void onDeviceDictation().then((value) => {
      if (isActive) setAvailable(value);
    });
    return () => {
      isActive = false;
    };
  }, []);
  return [isAvailable, setAvailable];
}

type Props = {
  /** Texto final reconhecido (a tela junta ao que já foi digitado). */
  onTranscript: (text: string) => void;
  /** O reconhecimento local deixou de valer: o botão some e a tela mostra a dica do teclado. */
  onUnavailable: (message: string) => void;
  /** Falha passageira (permissão, fala não reconhecida): o botão fica. */
  onError: (message: string) => void;
  disabled?: boolean;
};

/**
 * "Ditar descrição" (DIARIO-07): reconhecimento pt-BR exigido no aparelho
 * (`requiresOnDeviceRecognition`), então o áudio não sai dele. Só é desenhado quando
 * `useOnDeviceDictation()` confirmou o suporte, e só no Android: no iOS a biblioteca ignora o pedido
 * de reconhecimento local sem avisar (veja `onDeviceDictation`). Reage apenas às sessões que ele
 * mesmo iniciou.
 */
export function DictationButton({ onTranscript, onUnavailable, onError, disabled = false }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isRecording, setRecording] = useState(false);
  const isMine = useRef(false);

  // Sair da folha no meio do ditado encerra a escuta.
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
    if (SILENT_ERRORS.has(event.error)) return;
    if (GONE_ERRORS.has(event.error)) onUnavailable(UNAVAILABLE);
    else if (event.error === "not-allowed") onError(NOT_ALLOWED);
    else onError(FAILED);
  });

  const toggle = async () => {
    if (isRecording) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    // Segunda trava: fora do Android nenhuma sessão começa, mesmo que o botão apareça por engano.
    if (Platform.OS !== "android") {
      onUnavailable(UNAVAILABLE);
      return;
    }
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        onError(NOT_ALLOWED);
        return;
      }
      isMine.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: "pt-BR",
        interimResults: false,
        continuous: false,
        addsPunctuation: true,
        requiresOnDeviceRecognition: true,
      });
    } catch {
      isMine.current = false;
      setRecording(false);
      onUnavailable(UNAVAILABLE);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isRecording ? "Parar ditado" : "Ditar descrição"}
        accessibilityState={{ disabled, selected: isRecording }}
        disabled={disabled}
        onPress={() => void toggle()}
        style={({ pressed }) => [
          styles.button,
          isRecording && styles.recording,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {isRecording ? <Square size={16} color={colors.white} /> : <Mic size={19} color={colors.text2} />}
      </Pressable>
      <LiveAnnouncement message={isRecording ? LISTENING : ""} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  // Gravando: verde da marca (vermelho fica para ações destrutivas e erros).
  recording: { backgroundColor: colors.green600 },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.94 }] },
}));
