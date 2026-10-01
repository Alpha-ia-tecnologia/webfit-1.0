import { Alert, Platform } from "react-native";

/** Confirmação nativa (Alert) com o mesmo contrato do window.confirm do web. */
export function confirmAsync(
  title: string,
  message?: string,
  confirmLabel = "Confirmar",
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === "web") {
    const confirm = (globalThis as { confirm?: (text: string) => boolean }).confirm;
    return Promise.resolve(confirm ? confirm([title, message].filter(Boolean).join("\n")) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
