import { useApp } from "../lib/context";
import { localDate } from "../lib/dates";
import { bodyNumbers } from "../lib/space";

/**
 * "Ocultar números do corpo" (ESPACO-13) ligado no perfil: o texto salvo do agente (chat, dieta,
 * exames) passa pela máscara de peso, IMC e medidas antes de aparecer, inclusive o que foi gerado
 * antes de a preferência ser ligada. As respostas novas já chegam mascaradas do servidor.
 */
export function useBodyNumbersHidden(): boolean {
  const { state } = useApp();
  return state.profile ? bodyNumbers(state.profile, localDate()) === "hidden" : false;
}
