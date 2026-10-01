import { useEffect, useRef, useState } from "react";
import { useApp, type MealPreset } from "../../lib/context";
import type { PlatePhoto } from "../../lib/plate-photo";
import { readFile } from "../../lib/storage";

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_PROMPT =
  "Descreva os alimentos visíveis e as incertezas. Sugira itens a procurar no catálogo; não invente porções nem valores nutricionais a partir da imagem. Considere as alergias da anamnese.";

export interface PhotoAnalysis {
  /** Muda a cada análise: o rascunho da tela recomeça com as escolhas padrão. */
  id: number;
  text: string;
  /** Itens estruturados (DIARIO-04); null quando o agente respondeu só em texto. */
  draft: PlatePhoto | null;
}

/**
 * Foto do prato em Registrar refeição: anexar (galeria, câmera ou atalho), remover e pedir a
 * análise ao agente. Com o atalho "+ → Foto do prato" do chat, a análise é pedida sozinha uma
 * vez, assim que a foto carrega; se o agente estiver ocupado, espera; sem agente ou sem
 * autorização, o aviso da tela explica e nada é enviado.
 */
export function usePhotoAnalysis(initialPhoto: string, preset: MealPreset | null) {
  const { state, aiReady, aiRequest, aiBusy, notify } = useApp();
  const canAnalyze = aiReady && !!state.profile?.consentAi;
  const [photo, setPhoto] = useState(initialPhoto);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [isAutoPending, setAutoPending] = useState(() => !!preset?.analyze && !!preset.photo);
  const photoRef = useRef(photo);
  const analyses = useRef(0);
  useEffect(() => {
    photoRef.current = photo;
  });

  const attach = async (file: File) => {
    try {
      setPhoto(await readFile(file, PHOTO_MAX_BYTES, PHOTO_TYPES));
      setAnalysis(null);
    } catch (err) {
      notify((err as Error).message, "warning");
    }
  };
  const remove = () => {
    setPhoto("");
    setAnalysis(null);
  };
  // Foto vinda de um atalho (registro rápido, chat): chega com a tela, com as regras do anexo.
  const presetPhoto = preset?.photo;
  useEffect(() => {
    if (!presetPhoto) return;
    let isCurrent = true;
    readFile(presetPhoto, PHOTO_MAX_BYTES, PHOTO_TYPES)
      .then((url) => {
        if (!isCurrent) return;
        setPhoto(url);
        setAnalysis(null);
      })
      .catch((err: Error) => {
        if (!isCurrent) return;
        setAutoPending(false);
        notify(err.message, "warning");
      });
    return () => {
      isCurrent = false;
    };
  }, [presetPhoto, notify]);

  const analyze = async () => {
    if (aiBusy || !photo) return;
    const sent = photo;
    try {
      const reply = await aiRequest("photo", PHOTO_PROMPT, sent);
      // A foto foi trocada ou removida enquanto o agente respondia: a descrição não vale mais.
      if (photoRef.current !== sent) return;
      analyses.current += 1;
      setAnalysis({
        id: analyses.current,
        text: reply.text,
        draft: reply.structured?.kind === "photo" ? reply.structured.draft : null,
      });
      if (reply.meta.notes.length) notify(reply.meta.notes.join(" "), "info");
    } catch (err) {
      notify((err as Error).message, "warning");
    }
  };

  // Análise automática do atalho do chat: uma vez, com a foto carregada e o agente livre.
  useEffect(() => {
    if (!isAutoPending || !photo) return;
    if (!canAnalyze) {
      setAutoPending(false);
      return;
    }
    if (aiBusy) return;
    setAutoPending(false);
    void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- analyze usa a foto e o agente desta renderização; estas dependências decidem quando rodar
  }, [isAutoPending, photo, canAnalyze, aiBusy]);

  return { photo, attach, remove, analysis, analyze, canAnalyze };
}
