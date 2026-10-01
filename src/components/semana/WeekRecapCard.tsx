import { useId } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Scale,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import type { RecapTileKey, WeekRecap } from "../../lib/week-recap";
import { MoodFace } from "../hoje/MoodCard";
import { IconTile } from "../IconTile";
import "./WeekRecap.css";

/** Ícone de cada bloco; o de bem-estar é o rosto do humor médio. */
const TILE_ICONS: Record<Exclude<RecapTileKey, "bem_estar">, LucideIcon> = {
  registros: CalendarCheck,
  peso: Scale,
  agua: Droplets,
  combinados: CheckCircle2,
  refeicoes: UtensilsCrossed,
};

type Props = {
  recap: WeekRecap;
  onOpen: () => void;
  /** Só no Hoje: dispensa o cartão desta semana neste aparelho. */
  onDismiss?: () => void;
  /**
   * row (Evolução, "Mais da sua evolução"): uma linha de 56 px com o período, que abre os stories.
   * card (padrão, Hoje): os blocos da semana e o botão "Ver sua semana".
   */
  variant?: "card" | "row";
};

/**
 * Cartão "Sua semana" (EVOL-05): até 4 blocos da última semana completa e a entrada dos stories.
 * Nunca calorias, proteína ou medicação; peso só fora do perfil calmo (já filtrado em weekRecap).
 */
export function WeekRecapCard({ recap, onOpen, onDismiss, variant = "card" }: Props) {
  const id = useId();
  if (variant === "row")
    return (
      <div className="week-recap is-row" data-testid="week-recap">
        <button
          type="button"
          className="evol-more-row"
          aria-label={`Ver sua semana, ${recap.week.label}`}
          onClick={onOpen}
        >
          <IconTile tone="habit" icon={CalendarCheck} />
          <span className="evol-more-text">
            <strong>Sua semana</strong>
            <small>{recap.week.label}</small>
          </span>
          <ChevronRight className="evol-more-chevron" size={20} aria-hidden="true" />
        </button>
      </div>
    );
  return (
    <section className="card week-recap" data-testid="week-recap" aria-labelledby={id}>
      <header className="week-recap-head">
        <h2 id={id}>
          Sua semana <span className="week-recap-range">{recap.week.label}</span>
        </h2>
        {onDismiss && (
          <button
            type="button"
            className="icon-btn week-recap-dismiss"
            aria-label="Dispensar resumo da semana"
            onClick={onDismiss}
          >
            <X size={20} />
          </button>
        )}
      </header>
      <ul className="recap-grid" aria-label="Resumo da semana">
        {recap.tiles.map((tile) => {
          const Icon = tile.key === "bem_estar" ? null : TILE_ICONS[tile.key];
          return (
            <li key={tile.key} className={`recap-tile tone-${tile.tone}`}>
              <span aria-hidden="true" className="recap-tile-visual">
                {tile.face ? (
                  <MoodFace rating={tile.face} size={28} />
                ) : (
                  Icon && (
                    <span className={`recap-icon tone-${tile.tone}`}>
                      <Icon size={16} />
                    </span>
                  )
                )}
                <span className="recap-label">{tile.label}</span>
                <strong className="recap-value">{tile.value}</strong>
                {tile.detail && (
                  <span className={tile.key === "peso" ? "recap-delta" : "recap-detail"}>{tile.detail}</span>
                )}
              </span>
              <span className="sr-only">{tile.aria}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn week-recap-open" onClick={onOpen}>
        Ver sua semana <ChevronRight size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
