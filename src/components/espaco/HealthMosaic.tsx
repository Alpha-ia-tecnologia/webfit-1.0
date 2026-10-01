import { useId, useState, type ReactNode } from "react";
import { Briefcase, ChevronRight, FishOff, NutOff, Syringe, type LucideIcon } from "lucide-react";
import type { Domain } from "../../design/tokens";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import {
  anamneseCompletion,
  healthMosaic,
  PROFILE_HUB_COPY,
  sectionIndexOf,
} from "../../lib/profile-summary";
import { shouldShowTreatment } from "../../lib/treatment";
import { IconTile } from "../IconTile";
import { Pill } from "../Pill";
import { EssentialSheet } from "./EssentialCard";
import { ProfileAttention, ProfileSectionList } from "./ProfileHub";
import { ProfileSectionSheet } from "./ProfileSectionSheet";
import { TreatmentSheet } from "./TreatmentCard";

type Sheet = { kind: "essential" } | { kind: "treatment" } | { kind: "section"; index: number };
interface Chip {
  text: string;
  tone: Domain;
  srText?: string;
}

/** Uma célula ou linha do mosaico: botão de 44 px+ com nome = título; os chips descrevem. */
function MosaicItem({
  title,
  icon,
  tone,
  chips,
  layout,
  onOpen,
}: {
  title: string;
  icon: LucideIcon;
  tone: Domain;
  chips: Chip[];
  layout: "cell" | "row";
  onOpen: () => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      className={`mosaic-item is-${layout}`}
      aria-haspopup="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-chips`}
      onClick={onOpen}
    >
      <span className="mosaic-item-head">
        <IconTile tone={tone} size="md" icon={icon} className="mosaic-icon" />
        <span id={`${id}-title`} className="mosaic-item-title">
          {title}
        </span>
      </span>
      <span id={`${id}-chips`} className="mosaic-chips">
        {chips.map((chip) => (
          <Pill key={chip.text} tone={chip.tone} size="md" srText={chip.srText}>
            {chip.text}
          </Pill>
        ))}
      </span>
    </button>
  );
}

const none = (text: string): Chip[] => [{ text, tone: "neutral" }];

/**
 * "Perfil de saúde" em mosaico (conceito 11): alergias e o que evita lado a lado, a medicação pelo
 * último registro ("GLP-1" + nome e dose já registrados; os remédios da anamnese só como contagem;
 * condições nunca), a rotina e a linha "Anamnese completa · 7 seções", que abre as etapas.
 * "Precisa de atenção" fica acima do cartão quando há o que revisar.
 */
export function HealthMosaic({
  isHubOpen,
  onHubToggle,
  toggleId,
}: {
  isHubOpen: boolean;
  onHubToggle: () => void;
  toggleId: string;
}): ReactNode {
  const { state } = useApp();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const listId = useId();
  const p = state.profile;
  if (!p) return null;
  const today = localDate();
  const mosaic = healthMosaic(state, today);
  const done = anamneseCompletion(p, today);
  const [hubMain, hubRest] = done.label.split(" · ");
  const med = mosaic.medication;
  const medChips: Chip[] = [
    ...med.tags.map((tag) => ({ text: tag, tone: "medication" as const })),
    ...(med.name ? [{ text: [med.name, med.dose].filter(Boolean).join(" "), tone: "neutral" as const }] : []),
    ...(med.extraCount
      ? [
          med.tags.length || med.name
            ? { text: `+${med.extraCount}`, tone: "neutral" as const, srText: "outros medicamentos" }
            : {
                text: med.extraCount === 1 ? "1 informado" : `${med.extraCount} informados`,
                tone: "neutral" as const,
              },
        ]
      : []),
  ];
  const openSection = (anchor: string) => {
    const index = sectionIndexOf(anchor);
    setSheet(index >= 0 ? { kind: "section", index } : { kind: "essential" });
  };
  return (
    <section className="profile-hub health-mosaic-section" aria-labelledby="profile-hub-title">
      <h2 id="profile-hub-title" className="health-mosaic-title">
        {PROFILE_HUB_COPY.title}
      </h2>
      <ProfileAttention />
      <div className="card health-mosaic" data-testid="health-mosaic">
        <div className="mosaic-pair">
          <MosaicItem
            layout="cell"
            title="Alergias"
            icon={NutOff}
            tone="attention"
            chips={
              mosaic.allergies.length
                ? mosaic.allergies.map((text) => ({ text, tone: "attention" as const }))
                : none("Nenhuma")
            }
            onOpen={() => setSheet({ kind: "essential" })}
          />
          <MosaicItem
            layout="cell"
            title="Evita"
            icon={FishOff}
            tone="neutral"
            chips={
              mosaic.avoided.length
                ? mosaic.avoided.map((text) => ({ text, tone: "neutral" as const }))
                : none("Nada em especial")
            }
            onOpen={() => openSection("avoidedFoods")}
          />
        </div>
        <MosaicItem
          layout="row"
          title="Medicação"
          icon={Syringe}
          tone="medication"
          chips={medChips.length ? medChips : none("Nenhuma")}
          onOpen={() =>
            setSheet({ kind: shouldShowTreatment(p, state.injections) ? "treatment" : "essential" })
          }
        />
        <MosaicItem
          layout="row"
          title="Rotina"
          icon={Briefcase}
          tone="water"
          chips={mosaic.routine.length ? mosaic.routine.map((text) => ({ text, tone: "neutral" as const })) : none("Não informada")}
          onOpen={() => openSection("routine")}
        />
        <button
          type="button"
          id={toggleId}
          className="mosaic-hub-toggle"
          aria-expanded={isHubOpen}
          aria-controls={listId}
          onClick={onHubToggle}
        >
          <span className={done.isComplete ? "mosaic-hub-ring is-complete" : "mosaic-hub-ring"} aria-hidden="true" />
          <span className="mosaic-hub-label">
            <strong>{hubMain}</strong>
            {hubRest && <span> · {hubRest}</span>}
          </span>
          <ChevronRight className="mosaic-hub-chevron" size={20} aria-hidden="true" />
        </button>
        <div className="mosaic-hub-panel" hidden={!isHubOpen}>
          {isHubOpen && <ProfileSectionList id={listId} />}
        </div>
      </div>
      {sheet?.kind === "essential" && <EssentialSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === "treatment" && <TreatmentSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === "section" && (
        <ProfileSectionSheet index={sheet.index} onClose={() => setSheet(null)} />
      )}
    </section>
  );
}
