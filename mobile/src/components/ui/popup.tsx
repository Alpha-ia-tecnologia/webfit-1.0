import { Bell, Bot, CheckCircle2, Droplets, Sparkles, type LucideIcon } from "lucide-react-native";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, radius, shadows, type ThemeColors } from "@/theme/tokens";
import { Button } from "./button";
import { ProgressBar } from "./progress";
import { AppText } from "./text";

export type PopupKind = "meal" | "water" | "habit" | "ai" | "reminder";
export interface PopupContent {
  kind?: PopupKind;
  title: string;
  text: string;
  /** Progresso em relação à meta (0–100 ou mais); null ou ausente esconde a barra. */
  percent?: number | null;
  action?: { label: string; onPress: () => void };
}

type PopupTone = { bg: string; fg: string; gradient: readonly [string, string, ...string[]] };

const ICONS: Record<PopupKind, LucideIcon> = { meal: Sparkles, water: Droplets, habit: CheckCircle2, ai: Bot, reminder: Bell };
function toneOf(kind: PopupKind, colors: ThemeColors): PopupTone {
  switch (kind) {
    case "meal":
      return { bg: colors.mint50, fg: colors.green600, gradient: gradients.kcal };
    case "water":
      return { bg: colors.sky50, fg: colors.blue, gradient: gradients.sky };
    case "habit":
      return { bg: colors.mint50, fg: colors.green700, gradient: gradients.button };
    case "ai":
      return { bg: colors.indigo50, fg: colors.indigo500, gradient: gradients.brand };
    case "reminder":
      return { bg: colors.amber50, fg: colors.amber600, gradient: gradients.kcal };
  }
}
const MAX_TEXT_HEIGHT = 320;

/** Pop-up central para incentivos após registros, alertas de lembrete e o resumo do agente. */
export function Popup({ popup, onClose }: { popup: PopupContent | null; onClose: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  if (!popup) return null;
  const kind = popup.kind ?? "meal";
  const Icon = ICONS[kind];
  const tone = toneOf(kind, colors);
  const percent = popup.percent ?? null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card} accessibilityViewIsModal accessibilityLiveRegion="polite">
          <View style={[styles.icon, { backgroundColor: tone.bg }]}>
            <Icon size={26} color={tone.fg} />
          </View>
          <AppText heading size={fontSize.lg} weight={800} tracking={-0.02} align="center" accessibilityRole="header">
            {popup.title}
          </AppText>
          <ScrollView style={styles.textBox} contentContainerStyle={styles.textContent} showsVerticalScrollIndicator={false}>
            <AppText size={fontSize.base} color={colors.text2} lineHeight={21} align="center">
              {popup.text}
            </AppText>
          </ScrollView>
          {percent !== null && (
            <View style={styles.progress}>
              <ProgressBar percent={percent} gradient={tone.gradient} height={8} trackColor={colors.surface2} accessibilityLabel="Progresso em relação à meta" />
              <AppText size={fontSize["2xs"]} weight={600} color={colors.muted} align="center">
                {Math.min(999, Math.round(percent))}% da meta
              </AppText>
            </View>
          )}
          <View style={styles.actions}>
            {popup.action && (
              <Button
                label={popup.action.label}
                onPress={() => {
                  onClose();
                  popup.action?.onPress();
                }}
                wide
              />
            )}
            <Button label={popup.action ? "Depois" : "Continuar"} variant={popup.action ? "text" : "secondary"} onPress={onClose} wide />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrimPopup },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, gap: 12, padding: 22, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: "center", boxShadow: shadows.float },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  textBox: { maxHeight: MAX_TEXT_HEIGHT, alignSelf: "stretch" },
  textContent: { paddingHorizontal: 4 },
  progress: { alignSelf: "stretch", gap: 6 },
  actions: { alignSelf: "stretch", gap: 8, marginTop: 4 },
}));
