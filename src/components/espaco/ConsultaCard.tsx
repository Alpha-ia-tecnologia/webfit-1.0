import { useState } from "react";
import { CalendarPlus, ChevronRight, FileText } from "lucide-react";
import {
  appointmentIcs,
  appointmentSpeech,
  daysUntilLabel,
  icsFileName,
  professionalParts,
  splitAppointments,
} from "../../lib/appointments";
import { useApp } from "../../lib/context";
import { localDate, localTime } from "../../lib/domain";
import { ESSENTIAL_COPY } from "../../lib/essential";
import { downloadBlob } from "../../lib/storage";
import { Pill } from "../Pill";
import { DateBlock } from "./DateBlock";
import { LazyReportSheet } from "./LazyReportSheet";

/**
 * "Próxima consulta" (conceito 11), sempre acima das abas: selo de data, profissional e horário,
 * o .ics do calendário do aparelho e, no rodapé, o "Relatório para consulta". Sem consulta: um
 * atalho para a aba Exames, que tem o formulário. Registrar aqui nunca agenda nada.
 */
export function ConsultaCard({ onShowAppointments }: { onShowAppointments: () => void }) {
  const { state, notify } = useApp();
  const [isReportOpen, setReportOpen] = useState(false);
  const today = localDate();
  const next = splitAppointments(state.appointments, today, localTime()).next;
  const remind = () => {
    if (!next) return;
    downloadBlob(
      new Blob([appointmentIcs(next, new Date().toISOString())], {
        type: "text/calendar;charset=utf-8",
      }),
      icsFileName(next),
    );
    notify("Arquivo de agenda baixado. Abra-o para salvar o lembrete.", "info");
  };
  const who = next ? professionalParts(next.professional) : null;
  return (
    <section
      className="card consulta-card"
      data-testid="consulta-card"
      aria-labelledby="consulta-card-kicker"
    >
      {next && who ? (
        <div className="consulta-main">
          <DateBlock date={next.date} size="lg" variant="band" />
          <div className="consulta-text">
            <div className="consulta-kicker-row">
              <h2 id="consulta-card-kicker" className="consulta-kicker">
                Próxima consulta
              </h2>
              <Pill tone="water" size="sm" className="consulta-when">
                {daysUntilLabel(next.date, today)}
              </Pill>
            </div>
            <p className="consulta-name">{who.name}</p>
            <p className="consulta-meta">{[who.role, next.time].filter(Boolean).join(" · ")}</p>
            <p className="sr-only">{appointmentSpeech(next)}</p>
          </div>
          <button
            type="button"
            className="consulta-save"
            aria-label="Salvar a próxima consulta na agenda"
            onClick={remind}
          >
            <CalendarPlus size={20} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="consulta-main is-empty">
          <div className="consulta-text">
            <h2 id="consulta-card-kicker" className="consulta-kicker">
              Consultas
            </h2>
            <p className="consulta-name">Nenhuma consulta registrada</p>
          </div>
          <button type="button" className="link-btn consulta-link" onClick={onShowAppointments}>
            Ver consultas
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        type="button"
        className="consulta-foot"
        aria-haspopup="dialog"
        onClick={() => setReportOpen(true)}
      >
        <FileText size={18} aria-hidden="true" />
        <span className="consulta-foot-label">{ESSENTIAL_COPY.report}</span>
        <span className="consulta-foot-action">Gerar</span>
      </button>
      {isReportOpen && <LazyReportSheet onClose={() => setReportOpen(false)} />}
    </section>
  );
}
