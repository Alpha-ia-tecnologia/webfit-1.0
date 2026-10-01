import { useRef, useState } from "react";
import { useApp } from "../../lib/context";
import { localDate, uid } from "../../lib/domain";
import { tapFeedback } from "../../lib/haptics";
import { draftInjection, injectionTitle, type InjectionInput } from "../../lib/injection";
import type { InjectionEntry } from "../../types";

/** Campos que a tela escolhe; id, datas de criação e o "hoje" vêm do hook. */
export type InjectionFields = Omit<InjectionInput, "id" | "userId" | "now" | "today" | "createdAt">;
export interface SaveOptions {
  editing: InjectionEntry | null;
  /** true: continua na tela atual (Hoje); senão abre o Diário no dia da aplicação. */
  stay?: boolean;
  /**
   * Seringa (SERINGA-10): grava sem aviso nem "Desfazer" e fica na tela, porque a folha
   * "Aplicação registrada" confirma e oferece o desfazer. Implica `stay`.
   */
  quiet?: boolean;
}

const DOSE_MESSAGE = "Informe a dose prescrita antes de registrar.";
const INVALID_MESSAGE = "Confira a data, o horário e os valores da aplicação.";

/**
 * Único caminho de gravação da aplicação (recipe, calculadora, edição e Hoje): valida com
 * draftInjection, salva e oferece "Desfazer" só em registros novos. Chamadas enquanto salva são ignoradas.
 */
export function useInjectionSave() {
  const { state, commit, notify, setDate, openInjection, navigate } = useApp();
  const [isBusy, setBusy] = useState(false);
  const busyRef = useRef(false);

  /** Remove o registro recém-criado (aviso "Desfazer" ou folha "Aplicação registrada"). */
  const undo = async (entry: InjectionEntry) => {
    const removed = await commit((s) => ({
      ...s,
      injections: s.injections.filter((x) => x.id !== entry.id),
    }));
    if (removed) notify("Registro da aplicação desfeito.", "info");
  };

  const save = async (
    fields: InjectionFields,
    { editing, stay = false, quiet = false }: SaveOptions,
  ): Promise<InjectionEntry | null> => {
    if (busyRef.current) return null;
    const draft = draftInjection({
      ...fields,
      id: editing?.id ?? uid(),
      userId: state.userId,
      now: new Date().toISOString(),
      today: localDate(),
      createdAt: editing?.createdAt,
    });
    if (!draft.ok) {
      notify(draft.reason === "dose" ? DOSE_MESSAGE : INVALID_MESSAGE, "warning");
      return null;
    }
    const entry = draft.entry;
    busyRef.current = true;
    setBusy(true);
    const update = (s: typeof state) => ({
      ...s,
      injections: [...s.injections.filter((x) => x.id !== entry.id), entry],
    });
    const isSaved = quiet
      ? await commit(update)
      : await commit(
          update,
          editing ? "Aplicação atualizada." : `Aplicação registrada no diário: ${injectionTitle(entry)}.`,
          editing ? undefined : { label: "Desfazer", onAction: () => void undo(entry) },
        );
    busyRef.current = false;
    setBusy(false);
    if (!isSaved) return null;
    tapFeedback();
    if (!stay && !quiet) {
      setDate(entry.date);
      openInjection(null);
      navigate("diario");
    }
    return entry;
  };

  return { save, undo, isBusy };
}
