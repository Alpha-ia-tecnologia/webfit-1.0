import type { CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import { doseBand, doseRuler, type MedicationKey } from "../../lib/injection";

type Props = { medKey: MedicationKey; mg: number };

/**
 * Régua da bula (SERINGA-05): quatro faixas iguais, "Acima" hachurada, e o marcador na dose.
 * Só a trilha é imagem; os rótulos ficam fora dela (em duas linhas quando a régua é estreita) e o
 * aviso rosa é um irmão depois da trilha. Nunca bloqueia o registro.
 */
export function DoseRuler({ medKey, mg }: Props) {
  const ruler = doseRuler(medKey, mg);
  if (!ruler) {
    return <p className="inj-alert neutral">{doseBand("personalizado", mg).text}</p>;
  }
  const band = doseBand(medKey, mg);
  const pin = { "--pin": `${ruler.markerPercent}%` } as CSSProperties;
  return (
    <div className="inj-ruler" data-testid="injection-ruler">
      <div className="inj-ruler-grid">
        <div className="inj-ruler-track" role="img" aria-label={ruler.ariaLabel}>
          <div className="inj-ruler-bands">
            {ruler.bands.map((b) => (
              <span
                key={b.key}
                className={`${b.isHatched ? "hatch" : ""} ${b.key === ruler.active ? "on" : ""}`}
              />
            ))}
          </div>
          <span className="inj-ruler-pin" style={pin}>
            <i />
          </span>
        </div>
        {ruler.bands.map((b, i) => (
          <span
            key={b.key}
            className={`inj-ruler-label ${b.key === ruler.active ? "on" : ""}`}
            style={{ gridColumn: i + 1 }}
            aria-hidden="true"
          >
            {b.label}
          </span>
        ))}
      </div>
      {ruler.active === "acima" && (
        <div className="inj-alert rose" role="status">
          <TriangleAlert size={18} aria-hidden="true" />
          <p>
            <strong>{band.title}.</strong> {band.text}
          </p>
        </div>
      )}
    </div>
  );
}
