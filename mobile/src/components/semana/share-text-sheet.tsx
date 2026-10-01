import { Share2 } from "lucide-react-native";
import { useState } from "react";
import { Share } from "react-native";
import type { WeekRecap } from "@shared/lib/week-recap";
import { weekShare } from "@shared/lib/week-share";
import { AppText, Button, Card, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

const FAILURE = "Não foi possível abrir o compartilhamento neste aparelho.";

/** A pessoa fechou a folha de compartilhar do sistema (no web, navigator.share rejeita com AbortError). */
const isCancel = (error: unknown) => error instanceof Error && error.name === "AbortError";

type Props = { visible: boolean; recap: WeekRecap; onClose: () => void };

/**
 * "Compartilhar resumo" (EVOL-05 no app): o texto da semana, criado no aparelho, vai para o app que a
 * pessoa escolher pela folha do sistema. Só registros e conquistas: nunca peso, medicação, humor ou sono.
 */
export function ShareTextSheet({ visible, recap, onClose }: Props) {
  const colors = useThemeColors();
  const { notify } = useApp();
  const [hasFailed, setFailed] = useState(false);
  const share = weekShare(recap);
  const send = async () => {
    setFailed(false);
    try {
      // No export web o navigator.share resolve sem valor; no aparelho vem { action }.
      const result: { action?: string } | undefined = await Share.share({ title: share.title, message: share.text });
      if (result?.action !== Share.dismissedAction) onClose();
    } catch (error) {
      if (isCancel(error)) return;
      // O aviso fica sob a folha (outra janela): a frase também aparece aqui, sem repetir o anúncio.
      setFailed(true);
      notify(FAILURE, "warning");
    }
  };
  return (
    <Sheet
      visible={visible}
      title="Compartilhar resumo"
      onClose={onClose}
      footer={<Button label="Compartilhar" icon={Share2} wide onPress={() => void send()} />}
    >
      <Card>
        <AppText size={fontSize.sm} color={colors.text} lineHeight={21}>
          {share.text}
        </AppText>
      </Card>
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
        O texto só sai do aparelho se você escolher um app para compartilhar. Mostra só registros e conquistas: sem peso,
        medicação ou humor.
      </AppText>
      {hasFailed && (
        <AppText size={fontSize.sm} weight={600} color={colors.text2} aria-hidden>
          {FAILURE}
        </AppText>
      )}
    </Sheet>
  );
}
