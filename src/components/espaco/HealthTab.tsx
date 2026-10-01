import { BodyCard } from "./BodyCard";
import { GoalsCard } from "./GoalsCard";
import { HealthMosaic } from "./HealthMosaic";
import "./Health.css";

/** Id da linha "Anamnese completa · 7 seções" (o chip do topo leva o foco até ela). */
export const HEALTH_HUB_TOGGLE_ID = "health-hub-toggle";

/**
 * Aba "Saúde" (conceito 11): corpo em blocos, metas diárias e o perfil de saúde em mosaico. O
 * Essencial e o Meu tratamento abrem em folhas a partir do mosaico; as 7 seções da anamnese ficam
 * atrás da linha "Anamnese completa".
 */
export function HealthTab({
  isHubOpen,
  onHubToggle,
}: {
  isHubOpen: boolean;
  onHubToggle: () => void;
}) {
  return (
    <>
      <BodyCard />
      <GoalsCard />
      <HealthMosaic
        isHubOpen={isHubOpen}
        onHubToggle={onHubToggle}
        toggleId={HEALTH_HUB_TOGGLE_ID}
      />
    </>
  );
}
