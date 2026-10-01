import { CheckCircle2, CircleAlert, Info, TriangleAlert, X, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { arcDash } from "@shared/lib/charts";
import type { ToastMessage, ToastProgress } from "@shared/types";
import { circlePath } from "@/components/hoje/ring-path";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows, type ThemeColors } from "@/theme/tokens";
import { AppText } from "./text";

const DEFAULT_MS = 6000;
/** Avisos com "Desfazer" ficam mais tempo: é a única volta de uma exclusão (como o web). */
const ACTION_MS = 12000;
const RING = 24;
const RING_RADIUS = 9;
/** Área de toque de 44 px; a margem negativa mantém a altura do aviso (sem hitSlop, que o web ignora). */
const TOUCH = 44;
const TOUCH_INSET = 10;

const ICON: Record<ToastMessage["type"], LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
};

/** Quatro tipos (SIS-08): atenção é âmbar sobre o azul-marinho; o fundo vermelho é só para falha real. */
function iconColor(type: ToastMessage["type"], colors: ThemeColors): string {
  if (type === "success") return colors.emerald;
  if (type === "info") return colors.onFillSky;
  if (type === "warning") return colors.onFillAmber;
  return colors.onFillRose;
}
const ringColor = (tone: ToastProgress["tone"], colors: ThemeColors) => (tone === "water" ? colors.blue : colors.emerald);

type Props = {
  message: ToastMessage;
  onClose: () => void;
  bottom: number;
};

/** Mini anel do toast v2: quanto do dia de água ou dos combinados já foi (nunca para refeições). */
function ProgressRing({ progress }: { progress: ToastProgress }) {
  const colors = useThemeColors();
  const d = circlePath(RING / 2, RING_RADIUS);
  return (
    <View testID="toast-ring" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING_RADIUS} fill="none" stroke={colors.onFillOverlay} strokeWidth={3.5} />
        {progress.percent > 0 && (
          <Path
            d={d}
            fill="none"
            stroke={ringColor(progress.tone, colors)}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray={arcDash(RING_RADIUS, progress.percent)}
          />
        )}
      </Svg>
    </View>
  );
}

/** Mensagem temporária (.toast) acima da barra inferior, com ação opcional (ex.: "Desfazer"). */
export function Toast({ message, onClose, bottom }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const hasAction = Boolean(message.action);
  // onClose chega novo a cada render do provedor: numa ref, ele não reinicia o tempo do aviso.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), hasAction ? ACTION_MS : DEFAULT_MS);
    return () => clearTimeout(timer);
  }, [message.id, hasAction]);
  const Icon = ICON[message.type];
  const isUrgent = message.type === "warning" || message.type === "error";
  return (
    <Animated.View
      key={message.id}
      entering={FadeInDown.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[styles.toast, message.type === "error" && styles.error, { bottom }]}
      accessibilityLiveRegion={isUrgent ? "assertive" : "polite"}
      accessibilityRole={isUrgent ? "alert" : "text"}
      testID={`toast-${message.type}`}
    >
      {message.progress ? (
        <Animated.View entering={FadeIn.duration(400)}>
          <ProgressRing progress={message.progress} />
        </Animated.View>
      ) : (
        <View>
          <Icon size={20} color={iconColor(message.type, colors)} />
        </View>
      )}
      <AppText size={fontSize.sm} color={colors.white} style={styles.text}>
        {message.message}
      </AppText>
      {message.action && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={message.action.label}
          onPress={() => {
            message.action?.onAction();
            onClose();
          }}
          style={styles.actionHit}
        >
          {({ pressed }) => (
            <View style={[styles.action, pressed && styles.actionPressed]}>
              <AppText size={fontSize.sm} weight={700} color={colors.white}>
                {message.action?.label}
              </AppText>
            </View>
          )}
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar mensagem" onPress={onClose} style={styles.close}>
        <X size={18} color={colors.onFillMuted} />
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: colors.inverse,
    boxShadow: shadows.toast,
  },
  error: { backgroundColor: colors.rose800 },
  text: { flex: 1 },
  actionHit: {
    minHeight: TOUCH,
    marginVertical: -TOUCH_INSET,
    marginLeft: 4,
    justifyContent: "center",
  },
  action: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.onFillOverlaySoft,
  },
  actionPressed: { backgroundColor: colors.onFillOverlayStrong },
  close: {
    width: TOUCH,
    height: TOUCH,
    margin: -TOUCH_INSET,
    alignItems: "center",
    justifyContent: "center",
  },
}));
