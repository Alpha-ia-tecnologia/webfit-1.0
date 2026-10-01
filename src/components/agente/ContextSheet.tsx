import {
  BookOpen,
  ClipboardList,
  Cpu,
  FileText,
  ListChecks,
  Lock,
  Ruler,
  ShieldCheck,
  Syringe,
} from "lucide-react";
import { useApp } from "../../lib/context";
import {
  agentContextChips,
  providerLabel,
  type ContextChip,
} from "../../lib/agent-presentation";

/** O aviso que saiu do rodapé do chat (conceito 05): revisão automática, nunca humana. */
const REVIEW_NOTICE = "Revisão automática, sem revisão humana · apoio educativo";
import { Modal } from "../UI";

const CHIP_ICON: Record<ContextChip["key"], typeof Cpu> = {
  anamnese: ClipboardList,
  diario: BookOpen,
  medidas: Ruler,
  combinados: ListChecks,
  doses: Syringe,
  exames: FileText,
};

/** "O que o agente considera": chips com estado; os textos integrais continuam no detalhe. */
export function ContextSheet({ onClose }: { onClose: () => void }) {
  const { state, aiProviders, navigate } = useApp();
  const consent = !!state.profile?.consentAi;
  return (
    <Modal title="O que o agente considera" onClose={onClose}>
      <div className="context-sheet">
        <p className="hint">
          {consent
            ? "Enviado só quando você pede uma resposta."
            : "Compartilhamento desativado: nada é enviado à IA."}
        </p>
        <ul className="context-chips">
          {agentContextChips(state).map(({ key, label, detail, active }) => {
            const Icon = CHIP_ICON[key];
            return (
              <li
                key={key}
                className={`context-chip${active && consent ? "" : " off"}`}
              >
                <span className="context-chip-icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="context-provider">
          <Cpu size={15} aria-hidden="true" />
          Processado por {providerLabel(aiProviders)}
        </p>
        <details className="context-more">
          <summary>Detalhes do compartilhamento</summary>
          <p>
            Ao solicitar uma resposta, o contexto pode incluir suas respostas de
            saúde e rotina, registros dos últimos sete dias, medições, combinados,
            doses dos últimos 30 dias e informações de exames. Nome e
            nascimento são removidos dos campos estruturados. Evite
            identificadores em mensagens e arquivos.
          </p>
          <p>
            A DeepSeek e/ou a OpenAI processam o pedido conforme a configuração
            do serviço. Se ambas estiverem configuradas, a OpenAI pode receber o
            mesmo conteúdo como alternativa. Você pode desativar o
            compartilhamento em Meu espaço.
          </p>
        </details>
        <p className="context-lock">
          <ShieldCheck size={15} aria-hidden="true" />
          {consent ? REVIEW_NOTICE : "Contexto não compartilhado com a IA"}
        </p>
        <p className="context-lock">
          <Lock size={15} aria-hidden="true" />
          Seu contexto: sem nome nem data de nascimento.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            onClose();
            navigate("espaco");
          }}
        >
          Gerenciar em Meu espaço
        </button>
      </div>
    </Modal>
  );
}
