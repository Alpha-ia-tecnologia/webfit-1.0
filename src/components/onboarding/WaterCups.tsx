import { starterCups } from "../../lib/starter";

/**
 * Copos do que já foi registrado hoje (250 ml cada). Nunca desenha copos vazios: não há meta de
 * água no primeiro acesso. Depois de 8 copos, "+n". Decorativo: o total em texto vem ao lado.
 */
export function WaterCups({ ml }: { ml: number }) {
  const { full, more } = starterCups(ml);
  if (!full) return null;
  return (
    <div className="starter-cups" aria-hidden="true">
      {Array.from({ length: full }, (_, index) => (
        <svg
          key={index}
          className="starter-cup"
          data-testid="starter-cup"
          viewBox="0 0 24 28"
          width={24}
          height={28}
          focusable="false"
        >
          <path
            className="starter-cup-glass"
            d="M4 3h16l-2.2 20.6A2.6 2.6 0 0 1 15.2 26H8.8a2.6 2.6 0 0 1-2.6-2.4Z"
          />
          <path
            className="starter-cup-water"
            d="M5.4 10.5h13.2l-1.5 12.9a1.4 1.4 0 0 1-1.4 1.2H8.3a1.4 1.4 0 0 1-1.4-1.2Z"
          />
        </svg>
      ))}
      {more > 0 && <span className="starter-cups-more">+{more}</span>}
    </div>
  );
}
