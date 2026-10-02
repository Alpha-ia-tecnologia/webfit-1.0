import { Camera, FileText, Images, Plus, Refrigerator, ScanSearch } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Button, Sheet } from "@/components/ui";
import { MEAL_PHOTO_MAX_BYTES, pickPhoto } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows } from "@/theme/tokens";

type Props = {
  /** Foto do prato já reduzida (data URL): abre Registrar refeição com a análise automática. */
  onAttachPhoto: (dataUrl: string) => void;
  onOpenExams: () => void;
  onOpenPantry: () => void;
  /** "Analisar meu perfil": envia o pedido pronto ao agente. */
  onAnalyzeProfile: () => void;
  /** Só com o agente disponível para enviar (consentimento, conexão e nada em curso). */
  canAnalyze: boolean;
};

/**
 * "+" da barra do chat: um painel próprio (em vez de menu + outro painel, que abriria um modal
 * sobre outro fechando). A foto é escolhida aqui mesmo, como no registro rápido; exame e despensa
 * fecham o painel e abrem a tela certa; "Analisar meu perfil" fecha o painel e envia o pedido pronto.
 */
export function AttachButton({ onAttachPhoto, onOpenExams, onOpenPantry, onAnalyzeProfile, canAnalyze }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { notify } = useApp();
  const [isOpen, setOpen] = useState(false);
  const attach = async (source: "camera" | "library") => {
    try {
      const picked = await pickPhoto(source, MEAL_PHOTO_MAX_BYTES);
      if (!picked) return;
      setOpen(false);
      onAttachPhoto(picked.dataUrl);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível anexar a foto.", "warning");
    }
  };
  const go = (open: () => void) => {
    setOpen(false);
    open();
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mais opções do chat"
        accessibilityState={{ expanded: isOpen }}
        aria-expanded={isOpen}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Plus size={20} color={colors.text2} />
      </Pressable>
      <Sheet visible={isOpen} title="Mais opções" onClose={() => setOpen(false)}>
        <View style={styles.group}>
          <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
            Foto do prato
          </AppText>
          <AppText size={fontSize.sm} color={colors.muted} lineHeight={20}>
            Abre Registrar refeição com a foto. Com o agente conectado, ele sugere os itens para você conferir.
          </AppText>
          <View style={styles.sources}>
            <Button label="Câmera" variant="secondary" icon={Camera} onPress={() => void attach("camera")} style={styles.source} />
            <Button label="Galeria" variant="secondary" icon={Images} onPress={() => void attach("library")} style={styles.source} />
          </View>
        </View>
        <View style={styles.group}>
          <Button label="Exame" variant="secondary" icon={FileText} wide onPress={() => go(onOpenExams)} />
          <Button label="Despensa" variant="secondary" icon={Refrigerator} wide onPress={() => go(onOpenPantry)} />
          <Button
            label="Analisar meu perfil"
            variant="secondary"
            icon={ScanSearch}
            wide
            disabled={!canAnalyze}
            onPress={() => go(onAnalyzeProfile)}
          />
        </View>
      </Sheet>
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
    // Conceito 05: "+" redondo na superfície, com a sombra de cartão, ao lado do campo.
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  pressed: { transform: [{ scale: 0.94 }] },
  group: { gap: 10 },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  source: { flexGrow: 1 },
}));
