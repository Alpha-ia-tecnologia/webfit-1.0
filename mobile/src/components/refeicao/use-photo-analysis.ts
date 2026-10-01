import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatePhoto } from "@shared/lib/plate-photo";
import { MEAL_PHOTO_MAX_BYTES, pickPhoto } from "@/lib/storage";
import { useApp } from "@/state/app-context";

const PHOTO_PROMPT =
  "Descreva os alimentos visíveis e as incertezas. Sugira itens a procurar no catálogo; não invente porções nem valores nutricionais a partir da imagem. Considere as alergias da anamnese.";

/** Resposta do agente sobre a foto: o texto de sempre e, quando veio, o rascunho estruturado. */
export interface PhotoAnalysis {
  /** Muda a cada análise: o rascunho na tela recomeça com as escolhas padrão. */
  id: number;
  text: string;
  draft: PlatePhoto | null;
}

/**
 * Foto da refeição e a análise do agente. A foto vem do atalho (preset) ou é anexada aqui; a
 * análise só vale para a foto que foi enviada. Com `autoAnalyze` ("+ → Foto do prato" no chat), a
 * análise começa sozinha uma vez: espera o agente ficar livre e, sem conexão ou autorização,
 * desiste em silêncio (o aviso "A análise requer conexão…" já explica na tela).
 */
export function usePhotoAnalysis({ initialPhoto, autoAnalyze }: { initialPhoto: string; autoAnalyze: boolean }) {
  const { state, notify, aiReady, aiRequest, aiBusy } = useApp();
  const consentAi = state.profile?.consentAi ?? false;
  const [photo, setPhoto] = useState(initialPhoto);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [isPending, setPending] = useState(autoAnalyze && !!initialPhoto);
  const mounted = useRef(false);
  const analyzing = useRef(false);
  const analyses = useRef(0);
  // Foto atual para a resposta que chega depois (trocada ou removida: a análise não vale mais).
  const photoRef = useRef(photo);
  useEffect(() => {
    photoRef.current = photo;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const attach = async (source: "camera" | "library") => {
    try {
      const picked = await pickPhoto(source, MEAL_PHOTO_MAX_BYTES);
      if (!picked) return;
      setPhoto(picked.dataUrl);
      setAnalysis(null);
      setPending(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível anexar a foto.", "warning");
    }
  };
  const remove = () => {
    setPhoto("");
    setAnalysis(null);
    setPending(false);
  };
  const analyze = useCallback(async () => {
    const sent = photoRef.current;
    if (!sent || aiBusy || analyzing.current) return;
    analyzing.current = true;
    try {
      const reply = await aiRequest("photo", PHOTO_PROMPT, sent);
      if (!mounted.current || photoRef.current !== sent) return;
      analyses.current += 1;
      setAnalysis({
        id: analyses.current,
        text: reply.text,
        draft: reply.structured?.kind === "photo" ? reply.structured.draft : null,
      });
      if (reply.meta.notes.length) notify(reply.meta.notes.join(" "), "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível analisar a foto.", "warning");
    } finally {
      analyzing.current = false;
    }
  }, [aiBusy, aiRequest, notify]);

  // Análise automática: uma única vez, quando o agente estiver livre; nunca descartada sem motivo.
  useEffect(() => {
    if (!isPending || !photo) return;
    if (!(aiReady && consentAi)) {
      setPending(false);
      return;
    }
    if (aiBusy) return;
    setPending(false);
    void analyze();
  }, [isPending, photo, aiReady, consentAi, aiBusy, analyze]);

  return { photo, attach, remove, analysis, analyze };
}
