import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { useApp } from "../../lib/context";
import { downloadBlob } from "../../lib/storage";
import type { WeekShare } from "../../lib/week-share";
import { Modal } from "../UI";
import { useFocusAfterBusy } from "../useFocusAfterBusy";
import { renderWeekShareImage, SHARE_IMAGE_ERROR } from "./week-share-image";
import "./WeekRecap.css";

/** Imagem desenhada para um resumo (`source`): outro resumo nunca reaproveita a URL já revogada. */
type Drawn = { source: WeekShare; blob: Blob; url: string; file: File; canShare: boolean };
/** Folha fechada, outra já aberta pelo sistema ou compartilhamento em andamento: nada a avisar. */
const QUIET_SHARE_ERRORS = new Set(["AbortError", "InvalidStateError"]);

/** Compartilhamento de arquivos só quando o navegador aceita esta imagem (Web Share nível 2). */
function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * "Imagem da sua semana" (opt-in): prévia da imagem criada neste aparelho, "Baixar imagem" e, quando
 * o navegador compartilha arquivos, "Compartilhar". Cancelar o compartilhamento não é erro.
 */
export function ShareImageSheet({ share, onClose }: { share: WeekShare; onClose: () => void }) {
  const { notify } = useApp();
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [failedShare, setFailedShare] = useState<WeekShare | null>(null);
  // Um novo resumo (commit com a folha aberta) revoga a URL anterior: a prévia volta ao esqueleto.
  const image = drawn?.source === share ? drawn : null;
  const hasError = failedShare === share;
  // Trava síncrona: um segundo toque com a folha do sistema aberta não vira aviso de erro.
  const sharing = useRef(false);
  const [isSharing, setSharing] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  useFocusAfterBusy(isSharing, shareButton);
  useEffect(() => {
    let isActive = true;
    let url: string | null = null;
    renderWeekShareImage(share).then(
      (blob) => {
        if (!isActive) return;
        url = URL.createObjectURL(blob);
        const file = new File([blob], share.fileName, { type: "image/png" });
        setDrawn({ source: share, blob, url, file, canShare: canShareFile(file) });
      },
      () => {
        if (isActive) setFailedShare(share);
      },
    );
    return () => {
      isActive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [share]);
  const handleShare = async (file: File) => {
    if (sharing.current) return;
    sharing.current = true;
    setSharing(true);
    try {
      await navigator.share({ files: [file], title: share.title });
    } catch (error) {
      if (error instanceof DOMException && QUIET_SHARE_ERRORS.has(error.name)) return;
      notify("Não foi possível compartilhar a imagem.", "warning");
    } finally {
      sharing.current = false;
      setSharing(false);
    }
  };
  return (
    <Modal title="Imagem da sua semana" onClose={onClose} className="share-sheet">
      <div className="share-preview-frame">
        {image ? (
          <img
            className="share-preview"
            src={image.url}
            alt={share.alt}
            width={216}
            height={270}
            data-testid="share-preview"
          />
        ) : hasError ? (
          <p role="alert" className="share-error">
            {SHARE_IMAGE_ERROR}
          </p>
        ) : (
          <>
            <span className="skeleton-block share-preview-skeleton" aria-hidden="true" />
            <p role="status" className="sr-only">
              Criando a imagem neste aparelho.
            </p>
          </>
        )}
      </div>
      <p className="hint">
        A imagem é criada neste aparelho e só sai dele se você baixar ou compartilhar. Mostra só registros e
        conquistas: sem peso, medicação ou humor.
      </p>
      <div className="share-actions">
        <button
          type="button"
          className="btn"
          disabled={!image}
          onClick={() => image && downloadBlob(image.blob, share.fileName)}
        >
          <Download size={18} aria-hidden="true" />
          Baixar imagem
        </button>
        {image?.canShare && (
          <button
            ref={shareButton}
            type="button"
            className="btn-secondary"
            disabled={isSharing}
            aria-busy={isSharing}
            onClick={() => void handleShare(image.file)}
          >
            <Share2 size={18} aria-hidden="true" />
            Compartilhar
          </button>
        )}
      </div>
    </Modal>
  );
}
