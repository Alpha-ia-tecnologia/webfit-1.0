import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Check, Clock, Plus } from "lucide-react";
import type { ChatBlock, HabitBlock } from "../../lib/agent-blocks";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { uid } from "../../lib/domain";
import { tapFeedback } from "../../lib/haptics";
import { habitSchema } from "../../types";
import { PlannedItems } from "../PlannedItems";
import { useFocusAfterBusy } from "../useFocusAfterBusy";
import { usePlannedMealRegister, useResolvedPlanned } from "../usePlannedMeal";

type ActionBlock = Extract<ChatBlock, { tipo: "acao" }>;
type MealBlock = Extract<ActionBlock, { acao: "registrar_refeicao" }>;

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "15:00" → "15h"; "07:30" → "7h30" (rótulo curto do chip). */
export function shortHour(time: string): string {
  const [hour = "", minute = ""] = time.split(":");
  const h = String(Number(hour));
  return minute === "00" ? `${h}h` : `${h}h${minute}`;
}

/**
 * Criar o combinado proposto: só quando a pessoa confirma, com "Desfazer". Depois de criar, o
 * foco vai para o aviso "já está nos combinados" (o botão some) no mesmo quadro, antes que o
 * aviso do app leve o foco para o "Desfazer".
 */
function useHabitCreate(block: HabitBlock, doneRef: RefObject<HTMLElement | null>) {
  const { state, commit, notify } = useApp();
  const [isBusy, setBusy] = useState(false);
  // Trava síncrona: um segundo toque antes do próximo render não gera outro id nem outro aviso.
  const busyRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const shouldFocusDone = useRef(false);
  useFocusAfterBusy(isBusy, buttonRef);
  const exists = state.habits.some((habit) => sameTitle(habit.title, block.titulo));
  useLayoutEffect(() => {
    if (!exists || !shouldFocusDone.current) return;
    shouldFocusDone.current = false;
    doneRef.current?.focus();
  }, [exists, doneRef]);
  const create = async () => {
    if (busyRef.current) return;
    const id = uid();
    const parsed = habitSchema.safeParse({
      id,
      title: block.titulo,
      timeOfDay: block.horario,
      createdDate: localDate(),
      completedDates: [],
    });
    if (!parsed.success) {
      notify("Confira o nome e o horário do combinado.", "warning");
      return;
    }
    const habit = parsed.data;
    busyRef.current = true;
    setBusy(true);
    shouldFocusDone.current = true;
    const saved = await commit(
      (s) =>
        s.habits.some((h) => sameTitle(h.title, habit.title))
          ? s
          : { ...s, habits: [...s.habits, habit] },
      "Combinado criado.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) }),
            "Combinado desfeito.",
          ),
      },
    ).finally(() => {
      busyRef.current = false;
    });
    setBusy(false);
    if (!saved) {
      shouldFocusDone.current = false;
      return;
    }
    tapFeedback();
  };
  return { exists, isBusy, buttonRef, create };
}

/** Proposta de combinado em cartão: só é criado quando a pessoa confirma, e pode ser desfeito. */
function HabitProposal({ block }: { block: HabitBlock }) {
  const doneRef = useRef<HTMLParagraphElement>(null);
  const { exists, isBusy, buttonRef, create } = useHabitCreate(block, doneRef);
  return (
    <div className="chat-card action-card">
      <p className="action-eyebrow">Proposta de combinado</p>
      <h4 className="chat-card-title">{block.titulo}</h4>
      <p className="action-detail">
        <Clock size={14} aria-hidden="true" />
        Todos os dias às {block.horario}
      </p>
      {exists ? (
        <p ref={doneRef} className="action-done" tabIndex={-1}>
          <Check size={16} aria-hidden="true" />
          Já está nos seus combinados
        </p>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="btn action-btn"
          aria-label={`Criar combinado: ${block.titulo}`}
          disabled={isBusy}
          aria-busy={isBusy}
          onClick={() => void create()}
        >
          Criar combinado
        </button>
      )}
    </div>
  );
}

/**
 * Proposta de combinado em chip ("+ Garrafa de 1 L às 15h"), no cartão da semana: a mesma
 * confirmação, o mesmo "Desfazer" e o foco no chip pronto ("✓ … · nos combinados").
 */
export function HabitChip({ block }: { block: HabitBlock }) {
  const doneRef = useRef<HTMLSpanElement>(null);
  const { exists, isBusy, buttonRef, create } = useHabitCreate(block, doneRef);
  if (exists)
    return (
      <span ref={doneRef} className="prompt-pill is-done" tabIndex={-1}>
        <Check size={15} aria-hidden="true" />
        {block.titulo} · nos combinados
      </span>
    );
  return (
    <button
      ref={buttonRef}
      type="button"
      className="prompt-pill sky"
      aria-label={`Criar combinado: ${block.titulo}`}
      disabled={isBusy}
      aria-busy={isBusy}
      onClick={() => void create()}
    >
      <Plus size={16} aria-hidden="true" />
      {block.titulo} às {shortHour(block.horario)}
    </button>
  );
}

/** Proposta de registro: abre o prato pré-preenchido; quem salva é a pessoa. */
function MealProposal({ block }: { block: MealBlock }) {
  const register = usePlannedMealRegister();
  const resolved = useResolvedPlanned(block.itens);
  return (
    <div className="chat-card action-card">
      <p className="action-eyebrow">Proposta de registro</p>
      <h4 className="chat-card-title">{block.refeicao}</h4>
      <PlannedItems resolved={resolved} />
      <button
        type="button"
        className="btn action-btn"
        aria-label={`Conferir e registrar: ${block.refeicao}`}
        onClick={() => register(block.refeicao, block.itens)}
      >
        Conferir e registrar
      </button>
    </div>
  );
}

/** Ações propostas pelo agente: nada é executado sem a confirmação da pessoa. */
export function ActionCard({ block }: { block: ActionBlock }) {
  return block.acao === "criar_habito" ? (
    <HabitProposal block={block} />
  ) : (
    <MealProposal block={block} />
  );
}
