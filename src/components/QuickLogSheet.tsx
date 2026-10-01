import { useId, useLayoutEffect, useState, type CSSProperties } from "react";
import { Camera, Droplets, Heart, Minus, Plus, Scale, Syringe, Utensils, type LucideIcon } from "lucide-react";
import { BODY_PRIVACY_COPY } from "../lib/body-privacy";
import { useApp } from "../lib/context";
import { COPY } from "../lib/copy";
import { latestWeight, mealSummary, quickWeight, stepWeight, WEIGHT_MAX, WEIGHT_MIN } from "../lib/diary-day";
import { localDate, uid } from "../lib/domain";
import { fmtKg, fmtNumber } from "../lib/format";
import { dishesFrom, recentMeals, type Dish } from "../lib/meals";
import { bodyNumbers } from "../lib/space";
import { humanDate } from "../lib/today";
import type { AppState } from "../types";
import { Modal } from "./UI";
import { QuickEntryForm } from "./QuickEntryForm";
import { useDiaryActions } from "./useDiaryActions";
import "./QuickLogSheet.css";

type View = "grid" | "agua" | "bem_estar" | "peso";
type Tile = { key: string; label: string; hint: string; icon: LucideIcon; tone: string; run: () => void };

/** Pratos na fileira "Repetir" (1 toque + Desfazer). */
const REPEAT_LIMIT = 3;
const WEIGHT_STEP_KG = 0.1;
/** Mesma quebra do CSS: acima dela, a barra lateral existe e o "+" flutuante some. */
const DESKTOP_QUERY = "(min-width: 801px)";
const POPOVER_GAP_PX = 12;
const POPOVER_MARGIN_PX = 16;
const POPOVER_MAX_HEIGHT_PX = 520;

/** No desktop, o popover nasce ao lado do botão "Registro rápido" da barra lateral. */
function usePopoverStyle(anchor: HTMLElement | null): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!anchor || !window.matchMedia(DESKTOP_QUERY).matches) return;
    const rect = anchor.getBoundingClientRect();
    if (!rect.width) return;
    const top = Math.max(
      POPOVER_MARGIN_PX,
      Math.min(rect.top, window.innerHeight - POPOVER_MAX_HEIGHT_PX - POPOVER_MARGIN_PX),
    );
    setStyle({ left: rect.right + POPOVER_GAP_PX, top });
  }, [anchor]);
  return style;
}

const parseKg = (text: string) => Number(text.trim().replace(",", "."));

/**
 * Peso com passos de ±0,1 kg a partir do último registrado. Mostra só o valor (sem diferenças nem
 * tendências) e salva na medição do dia escolhido; "Desfazer" volta exatamente ao estado anterior.
 * Com "Ocultar números do corpo" (ESPACO-13) o campo começa vazio, os passos esperam um valor
 * digitado e o aviso não repete o peso.
 */
function WeightForm({ day, onDone }: { day: string; onDone: () => void }) {
  const { state, commit } = useApp();
  const today = localDate();
  const hidden = state.profile ? bodyNumbers(state.profile, today) === "hidden" : false;
  const initial = latestWeight(state) ?? state.profile?.weight ?? WEIGHT_MIN;
  const [text, setText] = useState(hidden ? "" : fmtNumber(initial, 1));
  /** Número digitado ("72,5"); vazio, "," ou "." não contam. */
  const typed = text.trim() ? parseKg(text) : Number.NaN;
  const hasTyped = Number.isFinite(typed);
  // Oculto: os passos esperam um número digitado e nunca partem do peso salvo.
  const canStep = !hidden || hasTyped;
  const [error, setError] = useState("");
  const [isBusy, setBusy] = useState(false);
  const errorId = useId();
  const current = () => {
    const value = parseKg(text);
    return Number.isFinite(value) ? value : initial;
  };
  const step = (delta: number) => {
    if (hidden && !hasTyped) return;
    setText(fmtNumber(stepWeight(hidden ? typed : current(), delta), 1));
    setError("");
  };
  const save = async () => {
    const value = parseKg(text);
    if (!(value >= WEIGHT_MIN && value <= WEIGHT_MAX)) {
      setError(`Informe um peso entre ${WEIGHT_MIN} e ${WEIGHT_MAX} kg.`);
      return;
    }
    const weight = Math.round(value * 10) / 10;
    let before: Pick<AppState, "measurements" | "profile" | "goalHistory"> | null = null;
    setBusy(true);
    const saved = await commit(
      (s) => {
        const result = quickWeight(s, { id: uid(), date: day, weight, today });
        if (!result.success) throw new Error("Não foi possível salvar o peso. Confira o valor.");
        before = { measurements: s.measurements, profile: s.profile, goalHistory: s.goalHistory };
        return result.state;
      },
      hidden ? BODY_PRIVACY_COPY.weightSaved : `Peso salvo: ${fmtKg(weight)}.`,
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => {
            // Só volta ao estado anterior se o peso do dia ainda for o que acabou de ser salvo.
            if (!before || s.measurements.find((m) => m.date === day)?.weight !== weight)
              throw new Error("O peso desse dia mudou depois; nada foi desfeito.");
            return { ...s, ...before };
          }, "Peso desfeito."),
      },
    );
    setBusy(false);
    if (saved) onDone();
  };
  return (
    <>
      <p className="muted">{day === today ? "Hoje" : humanDate(day, today)} · ajuste de 0,1 em 0,1 kg ou digite.</p>
      <div className="weight-stepper">
        <button
          type="button"
          className="weight-step"
          aria-label="Diminuir 0,1 kg"
          disabled={isBusy || !canStep}
          onClick={() => step(-WEIGHT_STEP_KG)}
        >
          <Minus size={22} />
        </button>
        <label className="weight-value">
          <input
            inputMode="decimal"
            aria-label="Peso em kg"
            placeholder={hidden ? BODY_PRIVACY_COPY.weightPlaceholder : undefined}
            readOnly={isBusy}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
          />
          <span aria-hidden="true">kg</span>
        </label>
        <button
          type="button"
          className="weight-step"
          aria-label="Aumentar 0,1 kg"
          disabled={isBusy || !canStep}
          onClick={() => step(WEIGHT_STEP_KG)}
        >
          <Plus size={22} />
        </button>
      </div>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn weight-save" disabled={isBusy} onClick={() => void save()}>
        {isBusy ? "Salvando…" : "Salvar peso"}
      </button>
    </>
  );
}

/**
 * Registro rápido (HOJE-02): grade 3×2 (Refeição, Foto do prato, Água, Bem-estar, Peso e, para quem
 * usa caneta, Aplicação) e a fileira "Repetir" com 3 pratos recentes. No celular é uma folha que sobe
 * de baixo; no desktop, um popover ao lado do botão da barra lateral. A foto só é anexada ao registro.
 */
export function QuickLogSheet({
  anchor,
  logDate,
  onClose,
  initialView = "grid",
}: {
  anchor: HTMLElement | null;
  /** Dia dos registros novos: o aberto no Diário ou, fora dele, hoje. */
  logDate: string;
  onClose: () => void;
  /** Formulário aberto de início (atalho "Registrar água" do app instalado, HOJE-13). */
  initialView?: "grid" | "agua";
}) {
  const { state, date, setDate, editMeal, openInjection } = useApp();
  const actions = useDiaryActions();
  const [view, setView] = useState<View>(initialView ?? "grid");
  // Refeição, água e bem-estar leem o dia do contexto: alinha antes de abrir o formulário.
  const alignDate = () => {
    if (date !== logDate) setDate(logDate);
  };
  const popover = usePopoverStyle(anchor);
  const repeatId = useId();
  const p = state.profile;
  const today = localDate();
  const usesPen = p?.weightLossPen === "sim" || state.injections.length > 0;
  const dishes = dishesFrom(state.savedMeals, recentMeals(state.diary), today).slice(0, REPEAT_LIMIT);

  if (view === "agua" || view === "bem_estar")
    return (
      <Modal title={view === "agua" ? "Registrar água" : "Registrar bem-estar"} onClose={onClose}>
        <QuickEntryForm type={view} onDone={onClose} />
      </Modal>
    );
  if (view === "peso")
    return (
      <Modal title="Peso" onClose={onClose}>
        <WeightForm day={logDate} onDone={onClose} />
      </Modal>
    );

  const tiles: Tile[] = [
    {
      key: "refeicao",
      label: "Refeição",
      hint: "buscar alimentos",
      icon: Utensils,
      tone: "food",
      run: () => {
        alignDate();
        editMeal(null);
        onClose();
      },
    },
    {
      key: "agua",
      label: "Água",
      hint: "copo ou volume",
      icon: Droplets,
      tone: "water",
      run: () => {
        alignDate();
        setView("agua");
      },
    },
    {
      key: "bem_estar",
      label: "Bem-estar",
      hint: "humor e sono",
      icon: Heart,
      tone: "mind",
      run: () => {
        alignDate();
        setView("bem_estar");
      },
    },
    { key: "peso", label: "Peso", hint: "±0,1 kg", icon: Scale, tone: "body", run: () => setView("peso") },
    ...(usesPen
      ? [
          {
            key: "aplicacao",
            label: "Aplicação",
            hint: "seringa e dose",
            icon: Syringe,
            tone: "medication",
            run: () => {
              openInjection(null);
              onClose();
            },
          },
        ]
      : []),
  ];
  const repeat = async (dish: Dish) => {
    if (await actions.repeatMeal(dish.items)) onClose();
  };
  const renderTile = (tile: Tile) => {
    const Icon = tile.icon;
    return (
      <button key={tile.key} type="button" className={`quick-tile ${tile.tone}`} onClick={tile.run}>
        <span className="quick-tile-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className="quick-tile-label">{tile.label}</span>
        <span className="quick-tile-hint" aria-hidden="true">
          {tile.hint}
        </span>
      </button>
    );
  };
  return (
    <Modal
      title={COPY.quickLog}
      onClose={onClose}
      className="quick-sheet"
      overlayClassName="quick-overlay"
      style={popover}
    >
      <div className="quick-grid">
        {renderTile(tiles[0])}
        <label className="quick-tile food">
          <span className="quick-tile-icon" aria-hidden="true">
            <Camera size={20} />
          </span>
          <span className="quick-tile-label">Foto do prato</span>
          <span className="quick-tile-hint" aria-hidden="true">
            anexa ao registro
          </span>
          <input
            className="quick-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Foto do prato"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              alignDate();
              editMeal(null, { photo: file });
              onClose();
            }}
          />
        </label>
        {tiles.slice(1).map(renderTile)}
      </div>
      {dishes.length > 0 && (
        <section className="quick-repeat" aria-labelledby={repeatId}>
          <h3 id={repeatId}>Repetir</h3>
          <div className="quick-repeat-list">
            {dishes.map((dish) => (
              <button
                key={dish.id}
                type="button"
                className="quick-repeat-card"
                aria-label={`Repetir agora: ${dish.title}, ${dish.when ? `de ${dish.when}` : "favorito"}`}
                onClick={() => void repeat(dish)}
              >
                <strong>{dish.title}</strong>
                <span>{mealSummary({ items: dish.items, description: "" }).text}</span>
                <small>{dish.when ?? "favorito"}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}
