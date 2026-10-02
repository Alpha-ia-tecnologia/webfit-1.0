import { LinearGradient } from "expo-linear-gradient";
import { ArrowUp, ClipboardList, Droplets, History, Utensils, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import type { ChatSuggestion } from "@shared/lib/agent-presentation";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { diagonalDown, fontFamily, fontSize, gradients, radius, shadows, themeDomainTone } from "@/theme/tokens";
import { AttachButton } from "./attach-sheet";
import { VoiceButton } from "./voice-button";

export const MAX_INPUT = 6000;
/** O contador de caracteres só aparece perto do limite. */
const COUNTER_FROM = MAX_INPUT * 0.8;

function suggestionIcon(suggestion: ChatSuggestion): LucideIcon {
  if (suggestion.kind === "diet") return Utensils;
  if (/água/i.test(suggestion.label)) return Droplets;
  if (/anamnese/i.test(suggestion.label)) return ClipboardList;
  if (/registros/i.test(suggestion.label)) return History;
  return Utensils;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  /** Envio possível agora (sem outra solicitação ou verificação em curso). */
  canSend: boolean;
  canDictate: boolean;
  /** Atalhos do app; a tela só passa quando a última resposta não trouxe as próprias sugestões. */
  suggestions: ChatSuggestion[];
  onSuggestion: (suggestion: ChatSuggestion) => void;
  onTranscript: (text: string) => void;
  onVoiceError: (message: string) => void;
  /** Aviso de conexão/consentimento logo acima do campo. */
  notice?: ReactNode;
  paddingBottom: number;
  /** "+" → Foto do prato (data URL já reduzida). */
  onAttachPhoto: (dataUrl: string) => void;
  /** "+" → Exame. */
  onOpenExams: () => void;
  /** "+" → Despensa. */
  onOpenPantry: () => void;
  /** "+" → Analisar meu perfil (pedido pronto ao agente). */
  onAnalyzeProfile: () => void;
  /** "Analisar meu perfil" habilitado: agente disponível e nada em curso. */
  canAnalyze: boolean;
};

/**
 * Barra fixa do chat (ChatDock do web, conceito 05): "+" redondo (foto do prato, exame, despensa, análise do perfil), o campo em pílula com
 * o ditado dentro, à direita, e o envio redondo. Os atalhos do app só aparecem quando a última resposta não trouxe
 * sugestões; o aviso de revisão fica em "O que o agente considera".
 */
export function ChatDock({
  value,
  onChange,
  onSubmit,
  canSend,
  canDictate,
  suggestions,
  onSuggestion,
  onTranscript,
  onVoiceError,
  notice,
  paddingBottom,
  onAttachPhoto,
  onOpenExams,
  onOpenPantry,
  onAnalyzeProfile,
  canAnalyze,
}: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const isSendDisabled = !value.trim() || !canSend;
  return (
    <View style={[styles.dock, { paddingBottom }]}>
      {suggestions.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroller}
          contentContainerStyle={styles.pills}
          keyboardShouldPersistTaps="handled"
          role="group"
          aria-label="Sugestões"
        >
          {suggestions.map((suggestion) => {
            const Icon = suggestionIcon(suggestion);
            const isDiet = suggestion.kind === "diet";
            // A rolagem corta hitSlop: a área de 44 pt é o próprio Pressable, a pílula de 36 pt fica dentro.
            return (
              <Pressable
                key={suggestion.label}
                accessibilityRole="button"
                accessibilityLabel={suggestion.label}
                onPress={() => onSuggestion(suggestion)}
                style={styles.pillTarget}
              >
                {({ pressed }) => (
                  <View style={[styles.pill, isDiet && styles.pillDiet, pressed && styles.pillPressed]}>
                    <Icon size={16} color={isDiet ? domainTone.food.fg : colors.green700} />
                    <AppText size={fontSize.base} weight={700} color={colors.green800} numberOfLines={1}>
                      {suggestion.label}
                    </AppText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {notice}
      {value.length >= COUNTER_FROM ? (
        <AppText size={fontSize.xs} color={colors.muted} style={styles.counter}>
          {`${value.length}/${MAX_INPUT}`}
        </AppText>
      ) : null}
      <View style={styles.form}>
        <AttachButton
          onAttachPhoto={onAttachPhoto}
          onOpenExams={onOpenExams}
          onOpenPantry={onOpenPantry}
          onAnalyzeProfile={onAnalyzeProfile}
          canAnalyze={canAnalyze}
        />
        <View style={styles.field}>
          <TextInput
            accessibilityLabel="Mensagem para o agente"
            placeholder="Pergunte ao seu agente…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={MAX_INPUT}
            value={value}
            onChangeText={onChange}
            style={styles.input}
          />
          <VoiceButton disabled={!canDictate} onTranscript={onTranscript} onError={onVoiceError} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
          accessibilityState={{ disabled: isSendDisabled }}
          disabled={isSendDisabled}
          onPress={() => onSubmit(value)}
          style={({ pressed }) => [styles.send, isSendDisabled && styles.sendDisabled, pressed && styles.sendPressed]}
        >
          <LinearGradient colors={gradients.fab} start={diagonalDown.start} end={diagonalDown.end} style={[StyleSheet.absoluteFill, styles.sendFill]} />
          <View>
            <ArrowUp size={20} color={colors.white} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  dock: { gap: 8, paddingTop: 8, paddingHorizontal: 12, backgroundColor: colors.bg },
  // Os alvos de 44 pt avançam 4 pt no respiro acima e abaixo: a barra mantém a altura.
  pillsScroller: { marginVertical: -4, marginHorizontal: -12, flexGrow: 0 },
  pills: { gap: 8, paddingHorizontal: 12, paddingBottom: 2 },
  pillTarget: { minHeight: 44, justifyContent: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.mint200,
    maxWidth: 280,
  },
  pillDiet: { backgroundColor: themeDomainTone(scheme).food.bg, borderColor: themeDomainTone(scheme).food.border },
  pillPressed: { transform: [{ scale: 0.97 }] },
  counter: { alignSelf: "flex-end", fontVariant: ["tabular-nums"] },
  /** "+" · campo em pílula (com o microfone dentro) · envio, cada um na sua forma. */
  form: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  field: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 2,
    paddingVertical: 2,
    borderRadius: 24,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingVertical: 11,
    paddingHorizontal: 0,
    color: colors.text,
    fontFamily: fontFamily(400),
    fontSize: fontSize.md,
  },
  send: {
    width: 44,
    height: 44,
    marginBottom: 2,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxShadow: shadows.fab,
  },
  sendFill: { borderRadius: 22 },
  sendDisabled: { opacity: 0.45 },
  sendPressed: { transform: [{ scale: 0.94 }] },
}));
