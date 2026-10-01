import { circumference, ringSegments } from "../lib/charts";
import { PLATE_GROUP_LABEL, plateLabel, type PlateGroup } from "../lib/taco-match";
import "./Plate.css";

const SIZE = 48;
const CENTER = SIZE / 2;
const RIM_RADIUS = 22;
const RADIUS = 15;
const GAP = 4;

const GROUP_CLASS: Record<PlateGroup, string> = {
  vegetais: "plate-veg",
  proteinas: "plate-protein",
  cereais: "plate-grain",
};

/**
 * Prato em vez de números (perfil sensível): um arco por grupo presente, sem quantidades e sem
 * marcar o que "falta". O nome acessível lista os grupos.
 */
export function MiniPlate({ groups }: { groups: readonly PlateGroup[] }) {
  const segments = ringSegments(RADIUS, groups.length, GAP);
  const full = circumference(RADIUS);
  return (
    <div className="mini-plate">
      <svg
        className="mini-plate-svg"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={plateLabel(groups)}
      >
        <circle className="plate-rim" cx={CENTER} cy={CENTER} r={RIM_RADIUS} />
        {groups.map((group, i) => (
          <circle
            key={group}
            className={`plate-arc ${GROUP_CLASS[group]}`}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            strokeDasharray={`${segments[i]?.length ?? 0} ${full}`}
            strokeDashoffset={segments[i]?.offset ?? 0}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
        ))}
      </svg>
      <ul className="mini-plate-legend" aria-hidden="true">
        {groups.map((group) => (
          <li key={group}>
            <i className={`plate-dot ${GROUP_CLASS[group]}`} />
            {PLATE_GROUP_LABEL[group]}
          </li>
        ))}
      </ul>
    </div>
  );
}
