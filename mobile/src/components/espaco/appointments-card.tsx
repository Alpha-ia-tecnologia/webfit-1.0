import { Bell, ExternalLink, Plus, Trash2 } from "lucide-react-native";
import { Linking, Platform, View } from "react-native";
import {
  appointmentIcs,
  appointmentSpeech,
  appointmentWhen,
  icsFileName,
  splitAppointments,
  utf8Base64,
} from "@shared/lib/appointments";
import { localDate, localTime } from "@shared/lib/domain";
import type { Appointment } from "@shared/types";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, Disclosure, Empty, OverflowMenu, type MenuItem } from "@/components/ui";
import { shareDataUrl } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { DateBlock } from "./date-block";

/** No web o arquivo é baixado; no aparelho abre o compartilhamento (calendário, arquivos). */
const REMINDER_TOAST =
  Platform.OS === "web"
    ? "Arquivo de agenda baixado. Abra-o para salvar o lembrete."
    : "Arquivo de agenda pronto. Abra-o no calendário para salvar o lembrete.";

/**
 * Consultas como agenda (ESPACO-11): a próxima em destaque com bloco de data, "Abrir link" e
 * "Lembrar-me" (arquivo .ics com alarme 1 hora antes), as seguintes em linhas e as anteriores
 * recolhidas. Registrar aqui não agenda com o profissional.
 */
export function AppointmentsCard({ onAdd }: { onAdd: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit, notify, clock } = useApp();
  const today = localDate(clock);
  const { next, upcoming, past } = splitAppointments(state.appointments, today, localTime(clock));

  const remove = (appointment: Appointment) =>
    void commit(
      (s) => ({ ...s, appointments: s.appointments.filter((a) => a.id !== appointment.id) }),
      "Consulta removida.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) =>
              s.appointments.some((a) => a.id === appointment.id)
                ? s
                : { ...s, appointments: [...s.appointments, appointment] },
            "Consulta restaurada.",
          ),
      },
    );
  const remind = (a: Appointment) => {
    const ics = appointmentIcs(a, new Date().toISOString());
    void shareDataUrl(`data:text/calendar;base64,${utf8Base64(ics)}`, icsFileName(a), "text/calendar")
      .then(() => notify(REMINDER_TOAST, "info"))
      .catch((e: Error) => notify(e.message, "warning"));
  };
  const open = (a: Appointment) =>
    void Linking.openURL(a.url).catch(() => notify("Não foi possível abrir o link da consulta.", "warning"));
  const menuFor = (a: Appointment, isPast: boolean): MenuItem[] => [
    ...(isPast
      ? []
      : [
          { label: "Abrir link da consulta", icon: ExternalLink, onSelect: () => open(a) },
          { label: "Lembrar-me", icon: Bell, onSelect: () => remind(a) },
        ]),
    { label: "Remover consulta", icon: Trash2, onSelect: () => remove(a) },
  ];

  return (
    <Card>
      <View style={styles.headRow}>
        <AppText heading size={fontSize.lg} weight={700} style={styles.grow} accessibilityRole="header">
          Minhas consultas
        </AppText>
        <Button label="Registrar consulta" variant="secondary" size="sm" icon={Plus} onPress={onAdd} />
      </View>
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
        Consultas já combinadas com seu profissional. Registrar aqui não agenda.
      </AppText>
      {!next && !past.length ? <Empty art="calendar">Nenhuma consulta registrada.</Empty> : null}
      {next ? (
        <View style={styles.next} testID="next-appointment">
          <AppText size={fontSize.xs} weight={800} color={colors.green700} upper tracking={0.06}>
            Próxima consulta
          </AppText>
          <View style={styles.nextRow}>
            <DateBlock date={next.date} size="lg" />
            <View style={styles.grow}>
              <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
                {next.professional}
              </AppText>
              <AppText size={fontSize.sm} weight={600} color={colors.text2}>
                {appointmentWhen(next, today)}
              </AppText>
              {next.registration ? (
                <AppText size={fontSize.xs} color={colors.muted}>
                  {next.registration}
                </AppText>
              ) : null}
              <AppText style={srOnly}>{appointmentSpeech(next)}</AppText>
            </View>
            <OverflowMenu label={`Mais ações: consulta com ${next.professional}`} items={menuFor(next, true)} />
          </View>
          {next.notes ? (
            <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
              {next.notes}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button label="Abrir link da consulta" size="sm" icon={ExternalLink} onPress={() => open(next)} />
            <Button
              label="Lembrar-me"
              accessibilityLabel={`Lembrar-me: salvar a consulta com ${next.professional} na agenda`}
              variant="secondary"
              size="sm"
              icon={Bell}
              onPress={() => remind(next)}
            />
          </View>
        </View>
      ) : null}
      {upcoming.length > 0 && (
        <View role="list" aria-label="Próximas consultas">
          {upcoming.map((a) => (
            <AppointmentRow key={a.id} appointment={a} today={today} items={menuFor(a, false)} />
          ))}
        </View>
      )}
      {past.length > 0 && (
        <Disclosure title={`Consultas anteriores (${past.length})`}>
          <View role="list">
            {past.map((a) => (
              <AppointmentRow key={a.id} appointment={a} today={today} items={menuFor(a, true)} />
            ))}
          </View>
        </Disclosure>
      )}
    </Card>
  );
}

function AppointmentRow({ appointment: a, today, items }: { appointment: Appointment; today: string; items: MenuItem[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="listitem" style={styles.row} testID="appointment-row">
      <DateBlock date={a.date} size="sm" />
      <View style={styles.grow}>
        <AppText size={fontSize.sm} weight={700}>
          {a.professional}
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted}>
          {appointmentWhen(a, today)}
        </AppText>
        <AppText style={srOnly}>{appointmentSpeech(a)}</AppText>
      </View>
      <OverflowMenu label={`Mais ações: consulta com ${a.professional}`} items={items} />
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  grow: { flex: 1, minWidth: 0, gap: 2 },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  next: {
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).water.border,
    backgroundColor: colors.surface,
  },
  nextRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
}));
