import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Vibrações curtas de confirmação. No web não há motor de vibração; no aparelho, uma falha
 * (motor ausente, modo economia) é descartada de propósito: a vibração é só um reforço e
 * nunca pode interromper o registro.
 */
function run(effect: () => Promise<void>): void {
  if (Platform.OS === "web") return;
  try {
    effect().catch(() => undefined);
  } catch {
    // Módulo nativo indisponível: segue sem vibrar.
  }
}

/** Toque leve ao escolher uma opção (local, seringa, medicação). */
export const selectionHaptic = () => run(() => Haptics.selectionAsync());

/** Confirmação de sucesso depois de um registro salvo. */
export const successHaptic = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
