import { CalendarPlus, ChevronRight, FileText } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import {
  appointmentIcs,
  appointmentSpeech,
  daysUntilLabel,
  icsFileName,
  professionalParts,
  splitAppointments,
  utf8Base64,
} from "@shared/lib/appointments";
import { localDate, localTime } from "@shared/lib/domain";
import { ESSENTIAL_COPY } from "@shared/lib/essential";
import { srOnly, webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card } from "@/components/ui";
import { shareDataUrl } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { DateBlock } from "./date-block";
import { ReportSheet } from "./report-sheet";

/** No web o arquivo é baixado; no aparelho abre o compartilhamento (calendário, arquivos). */
const REMINDER_TOAST =
  Platform.OS === "web"
    ? "Arquivo de agenda baixado. Abra-o para salvar o lembrete."
    : "Arquivo de agenda pronto. Abra-o no calendário para salvar o lembrete.";
/** Botão da agenda: 38 pt à vista (conceito 11) e toque de 44. */
const SAVE_SIZE = 38;
const TOUCH_PAD = 3;

/**
 * "Próxima consulta" (conceito 11; ConsultaCard do web), sempre acima das abas: selo de data, profissional e
 * horário, o .ics do calendário do aparelho e, no rodapé, o "Relatório para consulta". Sem consulta: um atalho
 * para a aba Exames, que tem o formulário. Registrar aqui nunca agenda nada.
 */
export function ConsultaCard({ onShowAppointments }: { onShowAppointments: () => void }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const { state, notify } = useApp();
  const [isReportOpen, setReportOpen] = useState(false);
  const today = localDate();
  const next = splitAppointments(state.appointments, today, localTime()).next;
  const who = next ? professionalParts(next.professional) : null;
  const water = themeDomainTone(scheme).water;
  const remind = () => {
    if (!next) return;
    const ics = appointmentIcs(next, new Date().toISOString());
    void shareDataUrl(`data:text/calendar;base64,${utf8Base64(ics)}`, icsFileName(next), "text/calendar")
      .then(() => notify(REMINDER_TOAST, "info"))
      .catch((e: Error) => notify(e.message, "warning"));
  };
  return (
    <Card testID="consulta-card" style={styles.card}>
      {next && who ? (
        <View style={styles.main}>
          <DateBlock date={next.date} size="lg" variant="band" />
          <View style={styles.text}>
            <View style={styles.kickerRow}>
              <AppText size={fontSize.xs} weight={800} upper tracking={0.02} color={colors.muted} accessibilityRole="header">
                Próxima consulta
              </AppText>
              <View style={[styles.when, { backgroundColor: water.bg, borderColor: water.border }]}>
                <AppText size={fontSize.xs} weight={700} color={colors.sky700} lineHeight={16}>
                  {daysUntilLabel(next.date, today)}
                </AppText>
              </View>
            </View>
            <AppText heading size={fontSize.lg} weight={800} tracking={-0.01} numberOfLines={1} style={styles.name}>
              {who.name}
            </AppText>
            <AppText size={fontSize.sm} color={colors.muted} style={styles.tabular}>
              {[who.role, next.time].filter(Boolean).join(" · ")}
            </AppText>
            <AppText style={srOnly}>{appointmentSpeech(next)}</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Salvar a próxima consulta na agenda"
            onPress={remind}
            style={({ pressed }) => [styles.saveTouch, pressed && styles.pressed]}
          >
            <View style={styles.save}>
              <CalendarPlus size={20} color={colors.green700} />
            </View>
          </Pressable>
        </View>
      ) : (
        <View style={styles.main}>
          <View style={styles.text}>
            <AppText size={fontSize.xs} weight={800} upper tracking={0.02} color={colors.muted} accessibilityRole="header">
              Consultas
            </AppText>
            <AppText heading size={fontSize.md} weight={800} style={styles.name}>
              Nenhuma consulta registrada
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onShowAppointments}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <AppText size={fontSize.sm} weight={800} color={colors.green700}>
              Ver consultas
            </AppText>
            <ChevronRight size={16} color={colors.green700} />
          </Pressable>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        {...webAttrs({ "aria-haspopup": "dialog" })}
        onPress={() => setReportOpen(true)}
        style={({ pressed }) => [styles.foot, pressed && styles.pressed]}
      >
        <FileText size={18} color={colors.muted} />
        <AppText size={fontSize.md} color={colors.text2} style={styles.grow}>
          {ESSENTIAL_COPY.report}
        </AppText>
        <AppText size={fontSize.md} weight={800} color={colors.green700}>
          Gerar
        </AppText>
      </Pressable>
      {isReportOpen ? <ReportSheet onClose={() => setReportOpen(false)} /> : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 0, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 2 },
  main: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  text: { flex: 1, minWidth: 0 },
  kickerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 4, columnGap: 6 },
  when: { minHeight: 22, paddingHorizontal: 7, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center" },
  name: { marginTop: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  saveTouch: { padding: TOUCH_PAD, margin: -TOUCH_PAD },
  save: {
    width: SAVE_SIZE,
    height: SAVE_SIZE,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
  },
  link: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44 },
  foot: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 },
  grow: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
}));
