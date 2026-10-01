import type { Ref } from "react";
import type { View } from "react-native";
import { BodyCard } from "./body-card";
import { GoalsCard } from "./goals-card";
import { HealthMosaic } from "./health-mosaic";

type Props = {
  /** "Ajustar em Preferências" do corpo com os números ocultos. */
  onOpenPreferences?: () => void;
  isHubOpen: boolean;
  onHubToggle: () => void;
  hubToggleRef?: Ref<View>;
};

/**
 * Aba "Saúde" (conceito 11; HealthTab do web): corpo em blocos, metas diárias e o perfil de saúde em mosaico. O
 * Essencial e o Meu tratamento abrem em folhas a partir do mosaico; as 7 seções da anamnese ficam atrás da linha
 * "Anamnese completa".
 */
export function HealthTab({ onOpenPreferences, isHubOpen, onHubToggle, hubToggleRef }: Props) {
  return (
    <>
      <BodyCard onOpenPreferences={onOpenPreferences} />
      <GoalsCard />
      <HealthMosaic isHubOpen={isHubOpen} onHubToggle={onHubToggle} hubToggleRef={hubToggleRef} />
    </>
  );
}
