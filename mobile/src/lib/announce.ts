import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * iOS: o VoiceOver ignora `accessibilityLiveRegion` (região viva só existe no Android e no web). Este
 * gancho fala a mensagem pelo leitor de tela quando ela muda, como a região viva faria: nada na
 * montagem, nada com a mensagem vazia e nada enquanto `enabled` é falso (nem na mudança que acontece
 * junto com a volta de `enabled`, como a abertura de uma folha). No Android e no web não faz nada: a
 * região viva ao lado continua sendo o anúncio (sem repetir).
 */
export function useIosAnnouncement(message: string, enabled = true): void {
  const previous = useRef(message);
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    const isChanged = previous.current !== message;
    const isJustEnabled = enabled && !wasEnabled.current;
    previous.current = message;
    wasEnabled.current = enabled;
    if (!isChanged || isJustEnabled || !enabled || !message) return;
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  }, [message, enabled]);
}
