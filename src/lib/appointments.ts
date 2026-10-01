/**
 * Consultas como agenda (ESPACO-11): próxima, seguintes e anteriores, bloco de data, leitura para
 * leitor de tela e o arquivo .ics do "Lembrar-me". Puro e sem Intl (igual no Hermes): datas por
 * Date.UTC, nomes de mês e dia da semana por listas fixas. Registrar aqui não agenda nada.
 */
import { MONTHS_PT } from "../components/anamnese/inputs";
import type { Appointment } from "../types";
import { WEEKDAYS } from "./dates";

/** Uma consulta continua como "próxima" até 1 hora depois do horário marcado. */
export const APPOINTMENT_GRACE_MINUTES = 60;
const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86_400_000;

function parts(date: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return [y, m, d];
}
const dayNumber = (date: string) => {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
};
const minuteOfDay = (time: string) => {
  const [h = 0, min = 0] = time.split(":").map(Number);
  return h * 60 + min;
};
const startMinute = (date: string, time: string) =>
  dayNumber(date) * MINUTES_PER_DAY + minuteOfDay(time);
const weekdayIndex = (date: string) => {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export interface AppointmentSplit {
  /** A primeira que começa a partir de agora − 1 h; null sem nenhuma. */
  next: Appointment | null;
  /** As seguintes, depois de `next` (que não se repete aqui), em ordem crescente. */
  upcoming: Appointment[];
  /** As anteriores, da mais recente para a mais antiga. */
  past: Appointment[];
}

/** Separa as consultas pelo instante atual (data e hora locais "AAAA-MM-DD", "HH:MM"). */
export function splitAppointments(
  list: readonly Appointment[],
  nowDate: string,
  nowTime: string,
): AppointmentSplit {
  const cutoff = startMinute(nowDate, nowTime) - APPOINTMENT_GRACE_MINUTES;
  const sorted = [...list].sort(
    (a, b) => startMinute(a.date, a.time) - startMinute(b.date, b.time) || a.id.localeCompare(b.id),
  );
  const coming = sorted.filter((a) => startMinute(a.date, a.time) >= cutoff);
  const past = sorted.filter((a) => startMinute(a.date, a.time) < cutoff).reverse();
  return { next: coming[0] ?? null, upcoming: coming.slice(1), past };
}

export interface DateBlock {
  /** "qua" */
  weekday: string;
  /** "30" */
  day: string;
  /** "set" */
  month: string;
}

const weekdayLabel = (date: string) => WEEKDAYS[weekdayIndex(date)]!.label.toLowerCase();
const monthName = (date: string) => MONTHS_PT[parts(date)[1] - 1] ?? "";

/** "2026-09-30" → { weekday: "qua", day: "30", month: "set" }. */
export function dateBlock(date: string): DateBlock {
  return {
    weekday: weekdayLabel(date).slice(0, 3),
    day: String(parts(date)[2]),
    month: monthName(date).slice(0, 3),
  };
}

/** "quarta-feira, 30 de setembro de 2026, às 14:30". */
export function appointmentSpeech(a: Pick<Appointment, "date" | "time">): string {
  const [year, , day] = parts(a.date);
  return `${weekdayLabel(a.date)}, ${day} de ${monthName(a.date)} de ${year}, às ${a.time}`;
}

/** "Hoje às 14:30", "Amanhã às 09:00", "Em 5 dias · 14:30", "Ontem", "Há 3 dias". */
export function appointmentWhen(a: Pick<Appointment, "date" | "time">, today: string): string {
  const diff = dayNumber(a.date) - dayNumber(today);
  if (diff === 0) return `Hoje às ${a.time}`;
  if (diff === 1) return `Amanhã às ${a.time}`;
  if (diff > 1) return `Em ${diff} dias · ${a.time}`;
  return diff === -1 ? "Ontem" : `Há ${-diff} dias`;
}

/** "hoje", "amanhã", "em 5 dias"; antes de hoje: "ontem", "há 3 dias" (selo do cartão Próxima consulta). */
export function daysUntilLabel(date: string, today: string): string {
  const diff = dayNumber(date) - dayNumber(today);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff > 1) return `em ${diff} dias`;
  return diff === -1 ? "ontem" : `há ${-diff} dias`;
}

/**
 * Nome e função do profissional como digitados numa linha só: "Dra. Ana Souza (nutricionista)" →
 * { name: "Dra. Ana Souza", role: "Nutricionista" }. Sem parênteses no fim, role é null.
 */
export function professionalParts(text: string): { name: string; role: string | null } {
  const trimmed = text.trim();
  const match = /^(.*\S)\s*\(([^()]+)\)$/.exec(trimmed);
  if (!match) return { name: trimmed, role: null };
  const role = match[2]!.trim();
  return {
    name: match[1]!.trim(),
    role: role ? `${role[0]!.toLocaleUpperCase("pt-BR")}${role.slice(1)}` : null,
  };
}

const ICS_LINE_MAX = 73;
const CRLF = "\r\n";

/** Texto de propriedade do iCalendar: barra, ponto e vírgula, vírgula e quebras escapados. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Octetos de um caractere em UTF-8 (surrogate solto vira o caractere de substituição, 3 octetos). */
function utf8Size(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

/**
 * Dobra a linha em até 73 octetos UTF-8 (a RFC 5545 pede no máximo 75), sem partir um caractere
 * acentuado; cada continuação começa com um espaço, que conta no limite.
 */
function fold(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = utf8Size(char);
    if (size + bytes > ICS_LINE_MAX) {
      out.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out;
}

/** "2026-09-27T13:05:09.000Z" → "20260927T130509Z". */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Evento de 1 hora na hora local da consulta (sem fuso), com alarme 1 hora antes. O calendário do
 * aparelho faz o lembrete; o app não guarda nada novo.
 */
export function appointmentIcs(a: Appointment, stampIso: string): string {
  const summary = `Consulta com ${esc(a.professional)}`;
  const description = esc(
    [a.notes.trim(), `Link da consulta: ${a.url}`].filter(Boolean).join("\n"),
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WebFit//Consultas//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${a.id}@webfit.local`,
    `DTSTAMP:${utcStamp(stampIso)}`,
    `DTSTART:${a.date.replace(/-/g, "")}T${a.time.replace(":", "")}00`,
    "DURATION:PT1H",
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `URL:${a.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(fold).join(CRLF)}${CRLF}`;
}

export const icsFileName = (a: Pick<Appointment, "date">) => `consulta-${a.date}.ics`;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const REPLACEMENT = 0xfffd;

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    let cp = char.codePointAt(0)!;
    // Metade de par substituto solta vira U+FFFD, como no TextEncoder e no Buffer.
    if (cp >= 0xd800 && cp <= 0xdfff) cp = REPLACEMENT;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000)
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return bytes;
}

/** Base64 do texto em UTF-8, sem Buffer nem btoa (para data: URL no app nativo). */
export function utf8Base64(text: string): string {
  const bytes = utf8Bytes(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64[(triple >> 18) & 63]! + BASE64[(triple >> 12) & 63]!;
    out += i + 1 < bytes.length ? BASE64[(triple >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? BASE64[triple & 63]! : "=";
  }
  return out;
}
