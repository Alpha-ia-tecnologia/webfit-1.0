import { useId, type ChangeEvent } from "react";
import { Camera, Images, Keyboard, ReceiptText, Refrigerator, Sparkles } from "lucide-react";
import type { Domain } from "../../design/tokens";
import type { PantryDraft } from "../../types";
import { IconTile } from "../IconTile";
import { SegmentedControl } from "../SegmentedControl";
import {
  AreaAlert,
  AreaStatus,
  LOCATION_SEGMENTS,
  type PantryBusy,
  type PantryError,
  type PhotoMode,
} from "./shared";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const PHOTO_CHOICES: {
  mode: PhotoMode;
  icon: typeof Refrigerator;
  tone: Domain;
  title: string;
  sub: string;
}[] = [
  { mode: "pantry_photo", icon: Refrigerator, tone: "water", title: "Geladeira ou despensa", sub: "foto dos alimentos" },
  { mode: "shopping_photo", icon: ReceiptText, tone: "food", title: "Nota de compras", sub: "lista de compras realizadas" },
];

interface Props {
  busy: PantryBusy;
  error: PantryError | null;
  hide: boolean;
  hasConsent: boolean;
  isAiReady: boolean;
  canAi: boolean;
  photoMode: PhotoMode;
  location: PantryDraft["location"];
  photo: string;
  onPhotoMode: (mode: PhotoMode) => void;
  onLocation: (location: PantryDraft["location"]) => void;
  onAttach: (file?: File) => void;
  onScan: () => void;
  onManual: () => void;
  onCancel: () => void;
  onOpenEspaco: () => void;
}

/**
 * Adicionar alimentos (AGENTE-10), dentro da folha "Adicionar alimentos" (conceito 06: o formulário
 * sai da primeira tela): o que está na foto, digitar, tirar ou escolher a foto.
 */
export function AddPantryCard(props: Props) {
  const { busy, error, hide, photo, canAi, onAttach } = props;
  const modeLabelId = useId();
  const isBusy = !!busy;
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    onAttach(event.target.files?.[0]);
    event.target.value = "";
  };
  return (
    <div className="pantry-add">
      <p className="muted">Fotografe ou digite. Você revisa tudo antes de salvar.</p>
      <AgentNotice {...props} />
      <AreaAlert area="add" error={error} hide={hide} />
      <SegmentedControl
        label="Local inicial dos itens"
        segments={LOCATION_SEGMENTS}
        value={props.location}
        onChange={props.onLocation}
        disabled={isBusy}
      />
      <span id={modeLabelId} className="field-label">
        O que está na foto?
      </span>
      <div className="pantry-capture">
        <div className="capture-choices" role="radiogroup" aria-labelledby={modeLabelId}>
          {PHOTO_CHOICES.map(({ mode, icon, tone, title, sub }) => {
            const isSelected = props.photoMode === mode;
            return (
              <label key={mode} className={isSelected ? "capture-choice is-selected" : "capture-choice"}>
                <input
                  type="radio"
                  name="pantry-photo-mode"
                  value={mode}
                  checked={isSelected}
                  disabled={isBusy}
                  onChange={() => props.onPhotoMode(mode)}
                />
                <IconTile icon={icon} tone={tone} size="md" />
                <span className="capture-text">
                  <span className="capture-title">{title}</span>
                  <span className="capture-sub">{sub}</span>
                </span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className="capture-choice capture-manual"
          aria-label="Digitar: cadastrar item manualmente"
          disabled={isBusy}
          onClick={props.onManual}
        >
          <IconTile icon={Keyboard} size="md" />
          <span className="capture-text">
            <span className="capture-title">Digitar</span>
            <span className="capture-sub">cadastrar item manualmente</span>
          </span>
        </button>
      </div>
      <div className="capture-actions">
        <label className="btn-secondary capture-action">
          <Camera size={17} aria-hidden="true" />
          Tirar foto
          <input
            type="file"
            aria-label="Tirar foto"
            accept={PHOTO_ACCEPT}
            capture="environment"
            disabled={isBusy}
            onChange={pick}
          />
        </label>
        <label className="btn-secondary capture-action">
          <Images size={17} aria-hidden="true" />
          Escolher foto da galeria
          <input
            type="file"
            aria-label="Escolher foto da galeria"
            accept={PHOTO_ACCEPT}
            disabled={isBusy}
            onChange={pick}
          />
        </label>
      </div>
      {photo && (
        <div className="pantry-scan">
          <img src={photo} alt="Foto selecionada para reconhecer alimentos" />
          {busy === "scan" && (
            <span className="pantry-scan-line" aria-hidden="true" data-testid="pantry-scan-overlay" />
          )}
        </div>
      )}
      <AreaStatus area="add" busy={busy} onCancel={props.onCancel} />
      <button
        type="button"
        className="btn-secondary pantry-scan-btn"
        disabled={!photo || !canAi}
        onClick={props.onScan}
      >
        <Sparkles size={17} aria-hidden="true" />
        Reconhecer itens da foto
      </button>
    </div>
  );
}

/** Sem autorização, o cadastro manual continua; sem conexão com o agente, também. */
function AgentNotice({ hasConsent, isAiReady, onOpenEspaco }: Props) {
  if (!hasConsent)
    return (
      <p className="notice">
        O cadastro manual funciona sem IA. Para reconhecer fotos e criar receitas, autorize o agente em{" "}
        <button type="button" className="text-btn" onClick={onOpenEspaco}>
          Meu espaço
        </button>
        .
      </p>
    );
  if (!isAiReady)
    return (
      <p className="notice">
        O agente está desconectado. Você pode cadastrar e editar seus alimentos manualmente.
      </p>
    );
  return null;
}
