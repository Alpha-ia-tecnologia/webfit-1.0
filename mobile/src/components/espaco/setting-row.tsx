import { ChevronRight, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, IconTile } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type ColorScheme, type ThemeColors } from "@/theme/tokens";

/** Altura mínima de cada linha da lista de preferências (lista nativa). */
const ROW_MIN_HEIGHT = 52;

/** Grupo de linhas com divisórias suaves (.set-group). */
export function SettingGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.group}>{children}</View>;
}

/** Interruptor com rótulo: o nome acessível é só o rótulo (as verificações usam o texto exato). */
export function SwitchRow({
  icon,
  label,
  value,
  disabled,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.row} testID="setting-row">
      <IconTile icon={icon} size="md" tone="neutral" />
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={19} style={styles.grow}>
        {label}
      </AppText>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.green500 }}
        thumbColor={colors.white}
      />
    </View>
  );
}

/**
 * Linha com o valor atual e seta: abre uma folha (horário de silêncio, água) ou leva ao editor da
 * seção da anamnese. O nome acessível traz rótulo e valor.
 */
export function ValueRow({
  icon,
  label,
  value,
  opensSheet = true,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Abre um painel (aria-haspopup="dialog"); false para navegação. */
  opensSheet?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      {...(opensSheet ? webAttrs({ "aria-haspopup": "dialog" }) : {})}
      onPress={onPress}
      testID="setting-row"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <IconTile icon={icon} size="md" tone="neutral" />
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={19} style={styles.grow}>
        {label}
      </AppText>
      <AppText size={fontSize.sm} weight={600} color={colors.muted} style={styles.value} numberOfLines={1}>
        {value}
      </AppText>
      <ChevronRight size={18} color={colors.faint} />
    </Pressable>
  );
}

type StatusTone = "ok" | "attention" | "neutral";

function statusTones(colors: ThemeColors, scheme: ColorScheme): Record<StatusTone, { fg: string; bg: string }> {
  const attention = themeDomainTone(scheme).attention;
  return {
    ok: { fg: colors.green800, bg: colors.mint50 },
    attention: { fg: attention.fg, bg: attention.bg },
    neutral: { fg: colors.muted, bg: colors.surface2 },
  };
}

/** Linha de situação (ex.: "Agente · Pronto · DeepSeek"); o tom nunca é vermelho. */
export function StatusRow({
  icon,
  label,
  status,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  status: string;
  tone: StatusTone;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const t = statusTones(colors, scheme)[tone];
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${status}`} testID="agent-status">
      <IconTile icon={icon} size="md" tone="neutral" />
      <AppText size={fontSize.sm} color={colors.text2} style={styles.grow}>
        {label}
      </AppText>
      <View style={[styles.status, { backgroundColor: t.bg }]}>
        <AppText size={fontSize.xs} weight={700} color={t.fg} numberOfLines={2}>
          {status}
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  group: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  grow: { flex: 1, minWidth: 0 },
  value: { flexShrink: 1, maxWidth: "45%", textAlign: "right" },
  pressed: { opacity: 0.7 },
  status: {
    flexShrink: 1,
    maxWidth: "60%",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
}));
