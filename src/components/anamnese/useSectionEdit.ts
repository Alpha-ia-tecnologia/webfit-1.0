import { useEffect, useState } from "react";
import { questionnaire } from "../../data/questionnaire";
import { useApp } from "../../lib/context";
import {
  isSectionDirty,
  saveSection,
  SECTION_EDIT_COPY,
} from "../../lib/profile-summary";
import type { Draft } from "../../types";

export interface SectionEdit {
  /** Etapa aberta pelo hub "Seu perfil de saúde"; null = fluxo linear de sempre. */
  section: number | null;
  /** Volta ao Meu espaço; com mudanças não salvas, pede para descartar. */
  leave: (answers: Draft, step: number) => Promise<void>;
  /** Salva só a seção (metas do dia e medição como a anamnese completa) e volta ao Meu espaço. */
  save: (answers: Draft, step: number) => Promise<boolean>;
}

/**
 * Editor de uma seção (ANAMNESE-X1). O pedido do hub vale uma vez: é lido na montagem e limpo.
 * Perfil novo, "Revisar anamnese" e "Revisar tudo" seguem o fluxo linear.
 */
export function useSectionEdit(): SectionEdit {
  const {
    state,
    anamneseSection,
    clearAnamneseSection,
    commit,
    confirm,
    openEspaco,
    cancelAi,
  } = useApp();
  const [requested] = useState(() =>
    state.profile &&
    anamneseSection !== null &&
    Number.isInteger(anamneseSection) &&
    anamneseSection >= 0 &&
    anamneseSection < questionnaire.length - 1
      ? anamneseSection
      : null,
  );
  useEffect(() => {
    if (anamneseSection !== null) clearAnamneseSection();
  }, [anamneseSection, clearAnamneseSection]);

  const leave = async (answers: Draft, step: number) => {
    const profile = state.profile;
    if (
      profile &&
      isSectionDirty(profile, answers, step) &&
      !(await confirm({
        title: SECTION_EDIT_COPY.discardTitle,
        message: SECTION_EDIT_COPY.discardMessage,
        confirmLabel: SECTION_EDIT_COPY.discardConfirm,
      }))
    )
      return;
    openEspaco("perfil");
  };

  const save = async (answers: Draft, step: number) => {
    const profile = state.profile;
    if (!profile) return false;
    // Desligar a IA aqui cancela o que estiver em andamento, como na aba Preferências.
    if (answers.consentAi === false && profile.consentAi) cancelAi();
    const title = questionnaire[step]?.title ?? "";
    const saved = await commit(
      (current) => saveSection(current, answers, step),
      SECTION_EDIT_COPY.saved(title),
    );
    if (saved) openEspaco("perfil");
    return saved;
  };

  return { section: state.profile ? requested : null, leave, save };
}
