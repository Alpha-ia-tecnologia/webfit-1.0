import {
  BellRing,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import {
  appointmentIcs,
  appointmentSpeech,
  appointmentWhen,
  icsFileName,
  splitAppointments,
} from "../../lib/appointments";
import { useApp } from "../../lib/context";
import { localDate, localTime } from "../../lib/domain";
import { downloadBlob } from "../../lib/storage";
import type { Appointment } from "../../types";
import { OverflowMenu, type MenuItem } from "../OverflowMenu";
import { Card, Empty } from "../UI";
import { DateBlock } from "./DateBlock";

/**
 * "Minhas consultas" como agenda (ESPACO-11): a próxima em destaque, as seguintes em linhas e as
 * anteriores recolhidas. "Lembrar-me" baixa um .ics com alarme 1 hora antes: quem lembra é o
 * calendário do aparelho. Registrar aqui não agenda nada.
 */
export function AppointmentsCard({ onAdd }: { onAdd: () => void }) {
  const { state, commit, notify } = useApp();
  const today = localDate();
  const { next, upcoming, past } = splitAppointments(
    state.appointments,
    today,
    localTime(),
  );
  const remove = (appointment: Appointment) =>
    void commit(
      (s) => ({
        ...s,
        appointments: s.appointments.filter((a) => a.id !== appointment.id),
      }),
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
  const remind = (appointment: Appointment) => {
    downloadBlob(
      new Blob([appointmentIcs(appointment, new Date().toISOString())], {
        type: "text/calendar;charset=utf-8",
      }),
      icsFileName(appointment),
    );
    notify("Arquivo de agenda baixado. Abra-o para salvar o lembrete.", "info");
  };
  const openLink = (appointment: Appointment) =>
    window.open(appointment.url, "_blank", "noopener,noreferrer");
  const menuLabel = (a: Appointment) => `Mais ações: consulta com ${a.professional}`;
  const removeItem = (a: Appointment): MenuItem => ({
    label: "Remover consulta",
    icon: Trash2,
    onSelect: () => remove(a),
  });
  const row = (a: Appointment, items: MenuItem[]) => (
    <li key={a.id} className="appointment-row">
      <DateBlock date={a.date} size="sm" />
      <div className="appointment-row-text">
        <strong>{a.professional}</strong>
        <span>{appointmentWhen(a, today)}</span>
        <span className="sr-only">{appointmentSpeech(a)}</span>
      </div>
      <OverflowMenu label={menuLabel(a)} items={items} />
    </li>
  );
  return (
    <Card className="appointments-card">
      <div className="row-between">
        <h2>Minhas consultas</h2>
        <button type="button" className="btn-secondary" onClick={onAdd}>
          <Plus size={16} aria-hidden="true" />
          Registrar consulta
        </button>
      </div>
      <p className="hint">
        Consultas já combinadas com seu profissional. Registrar aqui não agenda.
      </p>
      {!state.appointments.length && (
        <Empty art="calendar">Nenhuma consulta registrada.</Empty>
      )}
      {next && (
        <article className="next-appointment" aria-labelledby="next-appointment-name">
          <p className="eyebrow">Próxima consulta</p>
          <div className="next-appointment-main">
            <DateBlock date={next.date} size="lg" />
            <div className="next-appointment-text">
              <h3 id="next-appointment-name">{next.professional}</h3>
              <p className="next-appointment-when">
                {appointmentWhen(next, today)}
              </p>
              {next.registration && <p className="hint">{next.registration}</p>}
              <p className="sr-only">{appointmentSpeech(next)}</p>
            </div>
            <OverflowMenu label={menuLabel(next)} items={[removeItem(next)]} />
          </div>
          {next.notes && <p className="next-appointment-notes">{next.notes}</p>}
          <div className="next-appointment-actions">
            <a
              className="btn btn-sm"
              href={next.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Abrir link da consulta
            </a>
            <button
              type="button"
              className="btn-secondary btn-sm"
              aria-label={`Lembrar-me: salvar a consulta com ${next.professional} na agenda`}
              onClick={() => remind(next)}
            >
              <BellRing size={16} aria-hidden="true" />
              Lembrar-me
            </button>
          </div>
        </article>
      )}
      {upcoming.length > 0 && (
        <ul className="appointment-list" aria-label="Consultas seguintes">
          {upcoming.map((a) =>
            row(a, [
              {
                label: "Abrir link da consulta",
                icon: ExternalLink,
                onSelect: () => openLink(a),
              },
              { label: "Lembrar-me", icon: BellRing, onSelect: () => remind(a) },
              removeItem(a),
            ]),
          )}
        </ul>
      )}
      {past.length > 0 && (
        <details className="appointments-past">
          <summary>Consultas anteriores ({past.length})</summary>
          <ul className="appointment-list">
            {past.map((a) => row(a, [removeItem(a)]))}
          </ul>
        </details>
      )}
    </Card>
  );
}
