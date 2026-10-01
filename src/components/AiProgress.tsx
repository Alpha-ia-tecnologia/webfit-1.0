import { useState } from "react";
import { BadgeCheck, BookOpen, Check, ShieldCheck, Sparkles } from "lucide-react";
import {
  AGENT_STAGES,
  stageLabel,
  type AgentProgress,
  type AgentStage,
  type StageMode,
} from "../lib/agent-stream";
import "./AiProgress.css";
import { SkeletonRows } from "./Skeleton";

const STAGE_ICON: Record<AgentStage, typeof Sparkles> = {
  contexto: BookOpen,
  especialista: Sparkles,
  seguranca: ShieldCheck,
  revisao: BadgeCheck,
};

/**
 * Espera da IA em etapas reais do grafo. Só a troca de etapa é anunciada (aria-live);
 * sem stream (ou antes da 1ª etapa) a primeira etapa aparece como ativa.
 */
export function AiProgress({
  title,
  detail,
  progress,
  mode,
  note,
  onCancel,
  cancelLabel = "Cancelar",
}: {
  title: string;
  /** Fase anterior ao grafo principal, como "Analisando exame 1 de 2". */
  detail?: string;
  progress: AgentProgress | null;
  mode: StageMode;
  note?: string;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const active = detail
    ? -1
    : progress
      ? AGENT_STAGES.indexOf(progress.stage)
      : 0;
  const activeLabel =
    active >= 0
      ? stageLabel(AGENT_STAGES[active], mode, progress?.attempt ?? 1)
      : "";
  const announcement = detail
    ? detail
    : progress
      ? `Etapa ${active + 1} de ${AGENT_STAGES.length}: ${activeLabel}`
      : "";
  // Na reescrita o especialista volta a ser a etapa ativa, mas a barra não encolhe.
  const [furthest, setFurthest] = useState(active);
  if (active > furthest) setFurthest(active);
  const fill = detail
    ? 0.08
    : (Math.max(active, furthest) + 1) / AGENT_STAGES.length;
  return (
    <div className="ai-progress" aria-busy="true">
      <div className="ai-progress-head">
        <span className="ai-progress-orb" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <div>
          <strong>{title}</strong>
          {detail ? (
            <p className="ai-progress-detail">{detail}</p>
          ) : (
            note && <p className="ai-progress-detail">{note}</p>
          )}
        </div>
      </div>
      <div className="ai-progress-track" aria-hidden="true">
        <span style={{ transform: `scaleX(${fill})` }} />
      </div>
      <ol className="ai-steps">
        {AGENT_STAGES.map((stage, index) => {
          const status =
            index < active ? "done" : index === active ? "active" : "todo";
          const Icon = status === "done" ? Check : STAGE_ICON[stage];
          return (
            <li
              key={stage}
              className={`ai-step ${status}`}
              aria-current={status === "active" ? "step" : undefined}
            >
              <span className="ai-step-dot" aria-hidden="true">
                <Icon size={13} />
              </span>
              {status === "active" ? activeLabel : stageLabel(stage, mode)}
            </li>
          );
        })}
      </ol>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {onCancel && (
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
      )}
    </div>
  );
}

/** Esqueleto do resultado enquanto a IA trabalha (sem animação com movimento reduzido). */
export function AiResultSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="ai-skeleton" aria-hidden="true">
      <SkeletonRows rows={rows} />
    </div>
  );
}
