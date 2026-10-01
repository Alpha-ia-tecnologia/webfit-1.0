import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Platform } from "react-native";
import { isPtBrLocale } from "@shared/lib/meal-text";

/**
 * Ditado da descrição de refeição (DIARIO-07) só no aparelho: o áudio nunca sai dele. Por enquanto,
 * só no Android: lá o reconhecedor é criado com `createOnDeviceSpeechRecognizer` e exigimos o pt-BR
 * instalado para uso sem rede.
 *
 * No iOS fica desligado (sem o botão; vale o microfone do teclado do sistema): o
 * expo-speech-recognition descarta em silêncio o `requiresOnDeviceRecognition` quando o pt-BR não tem
 * modelo local, e a verificação de suporte olha o idioma do aparelho, não o pt-BR. Um iPhone em
 * inglês passaria na verificação e mandaria o áudio da refeição aos servidores da Apple, sem aviso.
 * Só volta a valer depois de conferido num iPhone de verdade.
 *
 * No export web é sempre false (lá o reconhecedor é a Web Speech API, que envia o áudio a um
 * serviço remoto). Qualquer falha também dá false.
 */
export async function onDeviceDictation(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return false;
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return false;
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    return installedLocales.some(isPtBrLocale);
  } catch {
    return false;
  }
}
