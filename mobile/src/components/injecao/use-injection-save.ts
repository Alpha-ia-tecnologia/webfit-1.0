import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { localDate, uid } from "@shared/lib/domain";
import { draftInjection, injectionTitle, type DoseRecipe, type InjectionInput } from "@shared/lib/injection";
import type { AppState, InjectionEntry, InjectionSide, InjectionSite } from "@shared/types";
import { successHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";

const DOSE_MISSING = "Informe a dose prescrita antes de registrar.";
const CHECK_VALUES = "Confira a data, o horário e os valores da aplicação.";
const UNDONE = "Registro da aplicação desfeito.";

/** Local, lado, dia e horário escolhidos na folha de confirmação. */
export interface InjectionWhen {
  site: InjectionSite;
  /** Lado da pessoa; null quando não informado (registros antigos ou sem lado sugerido). */
  side: InjectionSide | null;
  date: string;
  time: string;
}

/** Rascunho de registro a partir da dose de sempre (o nome salvo é o da receita, para a sequência continuar). */
export function recipeInput(recipe: DoseRecipe, when: InjectionWhen, userId: string): InjectionInput {
  return {
    id: uid(),
    userId,
    now: new Date().toISOString(),
    today: localDate(),
    date: when.date,
    time: when.time,
    method: recipe.method,
    medication: recipe.medication,
    units: recipe.units,
    concentration: recipe.concentrationMgPerMl,
    syringe: recipe.syringeUnits,
    doseMg: recipe.doseMg,
    site: when.site,
    side: when.side,
    notes: "",
  };
}

type SaveOptions = {
  editing: boolean;
  /** Fica na tela atual (card do Hoje), com o aviso e o "Desfazer". */
  stay?: boolean;
  /** Fica na tela e grava sem aviso: a folha "Aplicação registrada" confirma e oferece o "Desfazer". */
  quiet?: boolean;
};

/**
 * Único caminho de gravação da aplicação (tela Seringa e dose e card do Hoje): valida pelo rascunho
 * compartilhado, grava, oferece "Desfazer" só em registros novos e, sem `stay`/`quiet`, segue para o
 * Diário. Toques repetidos enquanto grava são ignorados.
 */
export function useInjectionSave() {
  const { commit, notify, setDate, openInjection } = useApp();
  const router = useRouter();
  const busy = useRef(false);
  const [isBusy, setBusy] = useState(false);

  /** Desfaz um registro novo (aviso do Hoje ou folha "Aplicação registrada"). */
  const undo = (entry: InjectionEntry) =>
    void commit((s) => ({ ...s, injections: s.injections.filter((x) => x.id !== entry.id) })).then((done) => {
      if (done) notify(UNDONE, "info");
    });

  const save = async (input: InjectionInput, { editing, stay = false, quiet = false }: SaveOptions): Promise<InjectionEntry | null> => {
    if (busy.current) return null;
    const draft = draftInjection(input);
    if (!draft.ok) {
      notify(draft.reason === "dose" ? DOSE_MISSING : CHECK_VALUES, "warning");
      return null;
    }
    const entry = draft.entry;
    busy.current = true;
    setBusy(true);
    const write = (s: AppState): AppState => ({
      ...s,
      injections: [...s.injections.filter((x) => x.id !== entry.id), entry],
    });
    const saved = quiet
      ? await commit(write)
      : await commit(
          write,
          editing ? "Aplicação atualizada." : `Aplicação registrada no diário: ${injectionTitle(entry)}.`,
          editing ? undefined : { label: "Desfazer", onAction: () => undo(entry) },
        );
    busy.current = false;
    setBusy(false);
    if (!saved) return null;
    successHaptic();
    if (!stay && !quiet) {
      setDate(entry.date);
      openInjection(null);
      router.replace("/diario");
    }
    return entry;
  };

  return { save, undo, isBusy };
}
