import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPOINTMENT_GRACE_MINUTES,
  appointmentIcs,
  appointmentSpeech,
  appointmentWhen,
  dateBlock,
  icsFileName,
  splitAppointments,
  daysUntilLabel,
  professionalParts,
  utf8Base64,
} from "../src/lib/appointments";
import type { Appointment } from "../src/types";

const appt = (id: string, date: string, time: string, over: Partial<Appointment> = {}): Appointment => ({
  id,
  professional: "Dra. Ana Souza",
  registration: "",
  date,
  time,
  url: "https://exemplo.com/sala",
  notes: "",
  ...over,
});

test("splitAppointments: próxima até 1 hora depois do horário, seguintes em ordem e anteriores da mais recente", () => {
  assert.equal(APPOINTMENT_GRACE_MINUTES, 60);
  const graceEdge = appt("a1", "2026-09-27", "13:00");
  const justPast = appt("a2", "2026-09-27", "12:59");
  const soon = appt("a3", "2026-09-29", "10:00");
  const later = appt("a4", "2026-10-07", "09:00");
  const old = appt("a5", "2026-09-24", "16:00");
  const split = splitAppointments([later, old, soon, justPast, graceEdge], "2026-09-27", "14:00");
  assert.equal(split.next, graceEdge);
  assert.deepEqual(split.upcoming.map((a) => a.id), ["a3", "a4"]);
  assert.deepEqual(split.past.map((a) => a.id), ["a2", "a5"]);
  // A tolerância atravessa a meia-noite (contas em dias UTC, sem fuso).
  const lateNight = appt("n1", "2026-09-27", "23:45");
  assert.equal(splitAppointments([lateNight], "2026-09-28", "00:30").next, lateNight);
  assert.deepEqual(splitAppointments([lateNight], "2026-09-28", "00:46").past, [lateNight]);
  assert.deepEqual(splitAppointments([], "2026-09-27", "14:00"), { next: null, upcoming: [], past: [] });
});

test("dateBlock e appointmentSpeech: dia da semana e mês por extenso, sem Intl", () => {
  assert.deepEqual(dateBlock("2026-09-30"), { weekday: "qua", day: "30", month: "set" });
  assert.deepEqual(dateBlock("2026-10-03"), { weekday: "sáb", day: "3", month: "out" });
  assert.deepEqual(dateBlock("2026-03-01"), { weekday: "dom", day: "1", month: "mar" });
  assert.equal(
    appointmentSpeech({ date: "2026-09-30", time: "14:30" }),
    "quarta-feira, 30 de setembro de 2026, às 14:30",
  );
  assert.equal(
    appointmentSpeech({ date: "2026-10-03", time: "09:00" }),
    "sábado, 3 de outubro de 2026, às 09:00",
  );
});

test("appointmentWhen: hoje, amanhã, em n dias com hora, ontem e há n dias", () => {
  const today = "2026-09-27";
  assert.equal(appointmentWhen({ date: "2026-09-27", time: "14:30" }, today), "Hoje às 14:30");
  assert.equal(appointmentWhen({ date: "2026-09-28", time: "09:00" }, today), "Amanhã às 09:00");
  assert.equal(appointmentWhen({ date: "2026-10-02", time: "14:30" }, today), "Em 5 dias · 14:30");
  assert.equal(appointmentWhen({ date: "2026-09-26", time: "10:00" }, today), "Ontem");
  assert.equal(appointmentWhen({ date: "2026-09-24", time: "10:00" }, today), "Há 3 dias");
  assert.equal(appointmentWhen({ date: "2026-10-02", time: "10:00" }, "2026-09-30"), "Em 2 dias · 10:00");
});

test("appointmentIcs: linhas exatas, escape de ; , \\ e quebras, CRLF e dobra em 73 caracteres", () => {
  const a = appt("abc-123", "2026-09-30", "14:30", {
    professional: "Dra. Ana; Nutri, CRN\\3",
    notes: "  Levar exames\nde sangue  ",
  });
  const ics = appointmentIcs(a, "2026-09-27T13:05:09.123Z");
  assert.ok(ics.endsWith("\r\n"));
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /[\r\n]/);
  const lines = ics.slice(0, -2).split("\r\n");
  assert.ok(lines.every((line) => Array.from(line).length <= 73), "linha acima de 73");
  const unfolded = ics.replace(/\r\n /g, "").slice(0, -2).split("\r\n");
  assert.deepEqual(unfolded, [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WebFit//Consultas//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:abc-123@webfit.local",
    "DTSTAMP:20260927T130509Z",
    "DTSTART:20260930T143000",
    "DURATION:PT1H",
    "SUMMARY:Consulta com Dra. Ana\\; Nutri\\, CRN\\\\3",
    "DESCRIPTION:Levar exames\\nde sangue\\nLink da consulta: https://exemplo.com/sala",
    "URL:https://exemplo.com/sala",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Consulta com Dra. Ana\\; Nutri\\, CRN\\\\3",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
  // A descrição passa de 73 caracteres: a continuação começa com um espaço.
  const folded = lines.findIndex((line) => line.startsWith("DESCRIPTION:Levar"));
  assert.equal(Array.from(lines[folded]!).length, 73);
  assert.ok(lines[folded + 1]!.startsWith(" "));
  // Sem observações, só o link vai na descrição.
  assert.match(appointmentIcs(appt("x", "2026-09-30", "08:05"), "2026-09-27T00:00:00Z"), /\r\nDESCRIPTION:Link da consulta: https:\/\/exemplo.com\/sala\r\n/);
  assert.equal(icsFileName(a), "consulta-2026-09-30.ics");
});

test("appointmentIcs: dobra por octetos UTF-8 sem partir acentos nem emoji", () => {
  const long = appt("acentos", "2026-09-30", "14:30", {
    professional: `Dra. ${"Conceição ".repeat(12).trim()}`,
    notes: `${"Ação à noção ".repeat(10).trim()} 🍎`,
  });
  const ics = appointmentIcs(long, "2026-09-27T00:00:00Z");
  const lines = ics.split("\r\n");
  for (const line of lines)
    assert.ok(Buffer.byteLength(line, "utf8") <= 73, `${Buffer.byteLength(line, "utf8")} octetos: ${line}`);
  // Desdobrar devolve o texto inteiro, com cada caractere intacto.
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes(`SUMMARY:Consulta com Dra. ${"Conceição ".repeat(12).trim()}`));
  assert.ok(unfolded.includes(`${"Ação à noção ".repeat(10).trim()} 🍎`));
  assert.ok(!ics.includes("�"));
});

test("utf8Base64: igual ao Buffer para acentos, travessão, emoji e padding", () => {
  for (const text of ["Consulta — ação", "", "a", "ab", "abc", "Olá 🍎", "\ud800 solto", appointmentIcs(appt("u", "2026-09-30", "14:30"), "2026-09-27T00:00:00Z")])
    assert.equal(utf8Base64(text), Buffer.from(text, "utf8").toString("base64"), JSON.stringify(text));
});

test("daysUntilLabel: hoje, amanhã, em N dias; antes de hoje, ontem e há N dias", () => {
  const today = "2026-09-24";
  assert.equal(daysUntilLabel("2026-09-24", today), "hoje");
  assert.equal(daysUntilLabel("2026-09-25", today), "amanhã");
  assert.equal(daysUntilLabel("2026-09-29", today), "em 5 dias");
  assert.equal(daysUntilLabel("2026-10-01", today), "em 7 dias");
  assert.equal(daysUntilLabel("2026-09-23", today), "ontem");
  assert.equal(daysUntilLabel("2026-09-20", today), "há 4 dias");
});

test("professionalParts: nome e função entre parênteses no fim; sem parênteses, só o nome", () => {
  assert.deepEqual(professionalParts("Dra. Ana Souza (nutricionista)"), {
    name: "Dra. Ana Souza",
    role: "Nutricionista",
  });
  assert.deepEqual(professionalParts("  Dr. Caio (endocrinologista) "), {
    name: "Dr. Caio",
    role: "Endocrinologista",
  });
  assert.deepEqual(professionalParts("Dra. Ana Lima"), { name: "Dra. Ana Lima", role: null });
  assert.deepEqual(professionalParts("Clínica (sala 2) Centro"), { name: "Clínica (sala 2) Centro", role: null });
});
