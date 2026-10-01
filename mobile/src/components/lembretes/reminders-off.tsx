import { Moon } from "lucide-react-native";
import { View } from "react-native";
import { REMINDER_COPY, REMINDER_TONE, type ReminderPreview } from "@shared/lib/reminder-center";
import { AppText, Button, Card, EmptyArt } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { REMINDER_ICON } from "./reminder-icons";

const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;
/** Largura do texto do estado ilustrado (max-width: 34ch do web). */
const TEXT_WIDTH = 280;

type Props = {
  preview: ReminderPreview;
  onEnable: () => void;
  onAdjust: () => void;
};

/**
 * Lembretes desligados (NOTIF-01): ilustração, um convite gentil para ativar e "Como ficaria hoje",
 * a agenda do dia como se estivessem ligados (sem medidas para perfis sensíveis, herdado da agenda).
 */
export function RemindersOff({ preview, onEnable, onAdjust }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  return (
    <Card testID="reminders-off" style={styles.card}>
      <EmptyArt kind="notifications" />
      <AppText heading accessibilityRole="header" size={fontSize.lg} weight={800} align="center">
        {REMINDER_COPY.offTitle}
      </AppText>
      <AppText size={fontSize.sm} color={colors.text2} align="center" lineHeight={20} style={styles.text}>
        {REMINDER_COPY.offText}
      </AppText>
      <Button label={REMINDER_COPY.enable} onPress={onEnable} style={styles.center} />
      <View style={styles.preview}>
        <AppText heading accessibilityRole="header" size={fontSize.md} weight={700} align="center">
          {REMINDER_COPY.previewTitle}
        </AppText>
        {preview.chips.length ? (
          <View role="list" testID="reminders-preview" style={styles.chips}>
            {preview.chips.map((chip, index) => {
              const Icon = REMINDER_ICON[chip.type];
              return (
                <View key={`${chip.time}-${chip.label}-${index}`} role="listitem" style={styles.chip}>
                  <View {...HIDDEN}>
                    <Icon size={14} color={domainTone[REMINDER_TONE[chip.type]].fg} />
                  </View>
                  <AppText size={fontSize.sm} color={colors.text2}>
                    <AppText size={fontSize.sm} weight={700} color={colors.text}>
                      {chip.time}
                    </AppText>
                    {` ${chip.label}`}
                  </AppText>
                </View>
              );
            })}
          </View>
        ) : (
          <AppText size={fontSize.sm} color={colors.muted} align="center">
            {REMINDER_COPY.previewEmpty}
          </AppText>
        )}
        {preview.quiet ? (
          <View testID="reminders-quiet-chip" style={styles.quiet}>
            <View {...HIDDEN}>
              <Moon size={14} color={domainTone.mind.fg} />
            </View>
            <AppText size={fontSize.sm} weight={600} color={colors.text2}>
              {preview.quiet}
            </AppText>
          </View>
        ) : null}
      </View>
      <Button variant="text" label={REMINDER_COPY.adjust} onPress={onAdjust} style={styles.center} />
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  card: { alignItems: "center", paddingVertical: 24, gap: 10 },
  text: { maxWidth: TEXT_WIDTH },
  center: { alignSelf: "center" },
  preview: { alignSelf: "stretch", alignItems: "center", gap: 10, marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  quiet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).mind.border,
    backgroundColor: themeDomainTone(scheme).mind.bg,
  },
}));
