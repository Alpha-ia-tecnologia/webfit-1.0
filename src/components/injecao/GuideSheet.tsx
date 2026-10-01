import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "../UI";

const CARDS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: FlaskConical,
    title: "Confira o frasco",
    text: "A conversão usa a concentração do rótulo, em mg/ml: concentração errada resulta em dose errada. Frasco novo? Confira antes de aspirar.",
  },
  {
    icon: Syringe,
    title: "Leia a seringa certa",
    text: "Na seringa de insulina, 100 UI equivalem a 1 ml. Leia na borda do êmbolo.",
  },
  {
    icon: RefreshCw,
    title: "Troque o local",
    text: "Alterne abdômen, coxa e braço e troque de lado a cada aplicação. Use agulha ou seringa nova e evite áreas com hematoma, dor ou irritação.",
  },
  {
    icon: Stethoscope,
    title: "Quem orienta a dose",
    text: "O app e o agente não indicam nem ajustam doses. Náusea intensa, vômitos persistentes, dor abdominal forte ou reação no local da aplicação: procure quem prescreveu ou atendimento presencial.",
  },
];
/** Espera a rolagem parar antes de atualizar "N de 4" (sem anunciar posições intermediárias). */
const SETTLE_MS = 90;

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Guia rápido e segurança: quatro cartões em trilho com encaixe e botões anterior/próximo. */
export function GuideSheet({ onClose }: { onClose: () => void }) {
  const trackRef = useRef<HTMLOListElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);
  const go = (next: number) => {
    const track = trackRef.current;
    const target = Math.min(CARDS.length - 1, Math.max(0, next));
    setIndex(target);
    track?.scrollTo({
      left: target * track.clientWidth,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };
  const onScroll = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const track = trackRef.current;
      if (track && track.clientWidth > 0) setIndex(Math.round(track.scrollLeft / track.clientWidth));
    }, SETTLE_MS);
  };
  return (
    <Modal title="Guia rápido" onClose={onClose} className="inj-guide">
      <ol ref={trackRef} className="inj-guide-track" onScroll={onScroll}>
        {CARDS.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <span className="inj-guide-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <div className="inj-guide-nav">
        <button type="button" className="icon-btn" aria-label="Cartão anterior" aria-disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span aria-live="polite">
          {index + 1} de {CARDS.length}
        </span>
        <button type="button" className="icon-btn" aria-label="Próximo cartão" aria-disabled={index === CARDS.length - 1}
          onClick={() => go(index + 1)}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="hint inj-center">O registro fica no diário, neste navegador.</p>
    </Modal>
  );
}
