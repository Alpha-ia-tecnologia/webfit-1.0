import { Camera, Mic, ScanText, Sparkles } from "lucide-react";
import type { PlatePhoto } from "../../lib/plate-photo";
import type { FoodItem } from "../../types";
import { PhotoDraft } from "./PhotoDraft";

/** Título do atalho da foto; também o nome acessível do campo (o rótulo visível está no nome). */
const PHOTO_TILE_TITLE = "Foto do prato";
/** Atalho de ditado: "Voz" na tela, o nome acessível começa com "Descrever" (a folha é a mesma). */
const VOICE_TILE_LABEL = "Descrever por voz";

/**
 * Atalhos acima da busca, numa linha (conceito 02): foto do prato em destaque (anexada ao registro; a
 * IA separa os itens quando está disponível), voz (a folha "Descrever refeição" com o campo em foco e
 * a dica de ditar pelo microfone do teclado; DIARIO-07) e rótulo (cadastrar um alimento com os
 * valores da embalagem). Sem código de barras: não há base de códigos na TACO.
 */
export function CaptureTiles({
  hasPhoto,
  aiAvailable,
  onPhoto,
  onLabel,
  onDescribe,
}: {
  hasPhoto: boolean;
  aiAvailable: boolean;
  onPhoto: (file: File) => void;
  onLabel: () => void;
  onDescribe: () => void;
}) {
  return (
    <div className="capture-tiles">
      <label className="capture-tile photo">
        <span className="tile-icon" aria-hidden="true">
          <Camera size={18} />
        </span>
        {aiAvailable && (
          <span className="tile-badge" aria-hidden="true">
            <Sparkles size={13} />
            IA
          </span>
        )}
        <span className="tile-text">
          <span className="tile-title">{PHOTO_TILE_TITLE}</span>
          <span className="tile-sub">
            {hasPhoto
              ? "toque para trocar a foto"
              : aiAvailable
                ? "a IA separa os itens"
                : "fica junto do registro"}
          </span>
        </span>
        <input
          aria-label={PHOTO_TILE_TITLE}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPhoto(file);
            e.target.value = "";
          }}
        />
      </label>
      <button
        type="button"
        className="capture-tile small voice"
        aria-label={VOICE_TILE_LABEL}
        aria-haspopup="dialog"
        onClick={onDescribe}
      >
        <span className="tile-icon" aria-hidden="true">
          <Mic size={18} />
        </span>
        <span className="tile-title">Voz</span>
      </button>
      <button type="button" className="capture-tile small label" onClick={onLabel}>
        <span className="tile-icon" aria-hidden="true">
          <ScanText size={18} />
        </span>
        <span className="tile-title">Rótulo</span>
      </button>
    </div>
  );
}

/**
 * Foto anexada: miniatura, remover e pedir a análise ao agente. Com itens estruturados, o
 * rascunho para conferir e adicionar ao prato; resposta só em texto, o aviso de sempre.
 */
export function PhotoCard({
  photo,
  analysis,
  draft,
  draftId,
  allergyDetails,
  canAnalyze,
  analyzing,
  aiBlocked,
  onAnalyze,
  onRemove,
  onAddFoods,
  onSearch,
}: {
  photo: string;
  analysis: string;
  /** Itens estruturados da análise, já mascarados (hideCalories); null = só texto. */
  draft: PlatePhoto | null;
  /** Identifica a análise: uma nova recomeça o rascunho. */
  draftId: number;
  allergyDetails: string;
  canAnalyze: boolean;
  analyzing: boolean;
  aiBlocked: boolean;
  onAnalyze: () => void;
  onRemove: () => void;
  onAddFoods: (foods: FoodItem[]) => void;
  onSearch: (name: string) => void;
}) {
  return (
    <section className="card photo-card" aria-label="Foto anexada">
      <div className="photo-card-row">
        <img className="photo-thumb" src={photo} alt="Foto da refeição a registrar" />
        <div className="photo-card-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={!canAnalyze}
            aria-disabled={analyzing}
            onClick={() => !analyzing && onAnalyze()}
          >
            <Sparkles size={16} aria-hidden="true" />
            {analyzing ? "Analisando…" : "Pedir análise ao agente"}
          </button>
          <button type="button" className="text-btn" onClick={onRemove}>
            Remover foto
          </button>
        </div>
      </div>
      {aiBlocked && (
        <p className="hint">
          A análise requer conexão com o agente e sua autorização em Meu espaço.
        </p>
      )}
      {draft && (
        <PhotoDraft
          key={draftId}
          draft={draft}
          allergyDetails={allergyDetails}
          onAddFoods={onAddFoods}
          onSearch={onSearch}
        />
      )}
      {!draft && analysis && (
        <div className="notice whitespace-pre-wrap">
          {analysis}
          <p className="hint">Confira os alimentos e busque cada um abaixo antes de salvar.</p>
        </div>
      )}
    </section>
  );
}
