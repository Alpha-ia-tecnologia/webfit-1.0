import { LinearGradient } from "expo-linear-gradient";
import {
  BadgeCheck,
  BookOpen,
  Check,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import {
  AGENT_STAGES,
  stageLabel,
  type AgentProgress,
  type AgentStage,
  type StageMode,
} from "@shared/lib/agent-stream";
import { makeStyles, useThemeColors } from "@/theme/theme";
import {
  fontSize,
  gradients,
  horizontal,
  radius,
  shadows,
} from "@/theme/tokens";
import { Button } from "./button";
import { SkeletonRows, usePulse } from "./skeleton";
import { AppText } from "./text";

const STAGE_ICON: Record<AgentStage, LucideIcon> = {
  contexto: BookOpen,
  especialista: Sparkles,
  seguranca: ShieldCheck,
  revisao: BadgeCheck,
};
type StepStatus = "done" | "active" | "todo";
const STATUS_TEXT: Record<StepStatus, string> = {
  done: "concluída",
  active: "em andamento",
  todo: "a seguir",
};
const PULSE_MS = 800;
/** Opacidade mínima da etapa ativa e do orbe. */
const STEP_MIN = 0.55;
const ORB_MIN = 0.78;
/** Abaixo desta largura as etapas ficam em uma coluna (como o web em telas estreitas). */
const ONE_COLUMN_BELOW = 380;
/** Preenchimento mínimo da trilha enquanto a fase anterior ao grafo (exames) acontece. */
const DETAIL_FILL = 0.08;

/**
 * Anuncia a mensagem só quando ela muda: no nativo pelo leitor de tela; no web
 * (export do Expo) por uma região viva invisível.
 */
export function LiveAnnouncement({ message }: { message: string }) {
  const styles = useStyles();
  useEffect(() => {
    if (message && Platform.OS !== "web")
      AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  if (Platform.OS !== "web") return null;
  return (
    <AppText role="status" aria-live="polite" style={styles.srOnly}>
      {message}
    </AppText>
  );
}

function Step({
  stage,
  status,
  label,
  isNarrow,
}: {
  stage: AgentStage;
  status: StepStatus;
  label: string;
  isNarrow: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const pulse = usePulse(status === "active", STEP_MIN, PULSE_MS);
  const Icon = status === "done" ? Check : STAGE_ICON[stage];
  const iconColor =
    status === "active"
      ? colors.white
      : status === "done"
        ? colors.green700
        : colors.muted;
  const textColor =
    status === "active"
      ? colors.green800
      : status === "done"
        ? colors.text2
        : colors.muted;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${STATUS_TEXT[status]}`}
      style={[styles.step, isNarrow ? styles.stepFull : styles.stepHalf]}
    >
      <Animated.View
        style={[
          styles.dot,
          status === "done" && styles.dotDone,
          status === "active" && styles.dotActive,
          status === "active" && pulse,
        ]}
      >
        <Icon size={13} color={iconColor} />
      </Animated.View>
      <AppText
        size={fontSize.xs}
        weight={600}
        color={textColor}
        style={styles.stepLabel}
      >
        {label}
      </AppText>
    </View>
  );
}

type ProgressProps = {
  title: string;
  /** Fase anterior ao grafo principal, como "Analisando exame 1 de 2". */
  detail?: string;
  progress: AgentProgress | null;
  mode: StageMode;
  note?: string;
  onCancel?: () => void;
  cancelLabel?: string;
};

/**
 * Espera da IA em etapas reais do grafo. Só a troca de etapa é anunciada; sem stream
 * (ou antes da 1ª etapa) a primeira etapa aparece como ativa.
 */
export function AiProgress({
  title,
  detail,
  progress,
  mode,
  note,
  onCancel,
  cancelLabel = "Cancelar",
}: ProgressProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const orb = usePulse(true, ORB_MIN, PULSE_MS);
  const active = detail
    ? -1
    : progress
      ? AGENT_STAGES.indexOf(progress.stage)
      : 0;
  const activeLabel =
    active >= 0
      ? stageLabel(AGENT_STAGES[active], mode, progress?.attempt ?? 1)
      : "";
  const announcement = detail
    ? detail
    : progress
      ? `Etapa ${active + 1} de ${AGENT_STAGES.length}: ${activeLabel}`
      : "";
  // Na reescrita (ou ao salvar, sem progresso) a etapa ativa recua, mas a barra não encolhe.
  const [furthest, setFurthest] = useState(active);
  if (active > furthest) setFurthest(active);
  const fill = detail
    ? DETAIL_FILL
    : (Math.max(active, furthest) + 1) / AGENT_STAGES.length;
  const caption = detail || note;
  const isNarrow = width < ONE_COLUMN_BELOW;
  return (
    <View style={styles.box} aria-busy>
      <View style={styles.head}>
        <Animated.View style={[styles.orb, orb]} aria-hidden>
          <LinearGradient
            colors={gradients.button}
            start={horizontal.start}
            end={horizontal.end}
            style={[StyleSheet.absoluteFill, styles.orbFill]}
          />
          <View>
            <Sparkles size={18} color={colors.white} />
          </View>
        </Animated.View>
        <View style={styles.headCopy}>
          <AppText
            heading
            size={fontSize.md}
            weight={700}
            accessibilityRole="header"
          >
            {title}
          </AppText>
          {caption ? (
            <AppText size={fontSize.xs} color={colors.muted}>
              {caption}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.track} aria-hidden>
        <LinearGradient
          colors={gradients.brand}
          start={horizontal.start}
          end={horizontal.end}
          style={[styles.trackFill, { width: `${Math.round(fill * 100)}%` }]}
        />
      </View>
      <View style={styles.steps}>
        {AGENT_STAGES.map((stage, index) => {
          const status: StepStatus =
            index < active ? "done" : index === active ? "active" : "todo";
          return (
            <Step
              key={stage}
              stage={stage}
              status={status}
              label={status === "active" ? activeLabel : stageLabel(stage, mode)}
              isNarrow={isNarrow}
            />
          );
        })}
      </View>
      <LiveAnnouncement message={announcement} />
      {onCancel ? (
        <Button
          label={cancelLabel}
          variant="secondary"
          size="sm"
          onPress={onCancel}
        />
      ) : null}
    </View>
  );
}

/** Esqueleto do resultado enquanto a IA trabalha (kit SIS-06; parado com movimento reduzido). */
export function AiResultSkeleton({ rows = 3 }: { rows?: number }) {
  const styles = useStyles();
  return <SkeletonRows rows={rows} style={styles.skeleton} />;
}

const useStyles = makeStyles((colors) => ({
  box: {
    gap: 14,
    padding: 18,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.mint200,
    boxShadow: shadows.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  orb: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.button,
  },
  orbFill: { borderRadius: 14 },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: radius.pill },
  steps: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    paddingRight: 6,
  },
  stepHalf: { width: "50%" },
  stepFull: { width: "100%" },
  stepLabel: { flex: 1, minWidth: 0 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  dotDone: { backgroundColor: colors.mint100 },
  dotActive: {
    backgroundColor: colors.green600,
    borderWidth: 3,
    borderColor: colors.mint100,
  },
  skeleton: {
    gap: 12,
    padding: 18,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
}));
