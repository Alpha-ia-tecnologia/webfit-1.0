import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Camera } from "lucide-react";
import { AGENT_UNAVAILABLE } from "../../lib/agent-stream";
import { useApp } from "../../lib/context";
import type { MedicationKey } from "../../lib/injection";
import { LABEL_PHOTO_ERRORS, LABEL_REQUEST_TEXT } from "../../lib/label-read";
import { labelReview, type LabelChoice, type LabelReviewModel } from "../../lib/label-review";
import { readPantryPhoto } from "../../lib/storage";
import { AiProgress } from "../AiProgress";
import { Modal } from "../UI";
import "./Rotulo.css";

type Stage = "pick" | "sending" | "review" | "error";
type Props = {
  medKey: MedicationKey;
  /** Só depois de "Sim, usar …" ou "Usar a concentração escolhida": a concentração em mg/ml. */
  onConfirm: (concentration: number) => void;
  /** "Não é isso: digitar" / "Digitar a concentração": volta ao editor do frasco. */
  onManual: () => void;
  onClose: () => void;
};

const PICK_LABEL = "Escolher ou tirar foto";

/** Um candidato: o que está impresso, a confiança e o arredondamento explicado. */
function ChoiceDetail({ choice }: { choice: LabelChoice }) {
  return (
    <>
      <p className="label-printed">No rótulo: “{choice.printed}”</p>
      <span className="label-chip">{choice.confidence}</span>
      {choice.roundedNote && <p className="label-rounded">{choice.roundedNote}</p>}
    </>
  );
}

/**
 * "Ler rótulo do frasco" (INJECAO-X2): a foto vai só para a leitura e vive apenas no estado desta
 * folha (nunca em commit, aviso, armazenamento ou histórico); o campo de arquivo é limpo na hora.
 * O agente transcreve o rótulo, o app calcula a concentração e nada entra na calculadora sem a
 * confirmação da pessoa. A medicação nunca troca sozinha e a dose nunca é sugerida.
 */
export function LabelReadSheet({ medKey, onConfirm, onManual, onClose }: Props) {
  const { aiRequest, aiStage, cancelAi } = useApp();
  const [stage, setStage] = useState<Stage>("pick");
  const [photo, setPhoto] = useState<string | null>(null);
  const [review, setReview] = useState<LabelReviewModel | null>(null);
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [isChoiceMissing, setChoiceMissing] = useState(false);
  const [error, setError] = useState("");
  const [pickError, setPickError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef<HTMLDivElement>(null);
  /** Etapa que já recebeu o foco: a abertura fica com o foco inicial do Modal. */
  const focusedStage = useRef<Stage>(stage);
  const isMounted = useRef(true);
  const isCancelled = useRef(false);
  /** Leitura desta folha ainda em andamento (null: nenhuma). */
  const pending = useRef<symbol | null>(null);
  const groupName = useId();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Saiu da tela sem "Fechar": a leitura não fica ocupando o agente nem é cobrada à toa.
      if (pending.current) cancelAi();
    };
  }, [cancelAi]);
  // A cada troca de etapa o controle focado sai da tela: o foco vai para o que acabou de aparecer
  // (a espera, o botão da foto ou o título do resultado), nunca para o <body> do diálogo.
  useEffect(() => {
    if (focusedStage.current === stage) return;
    focusedStage.current = stage;
    const target =
      stage === "pick" ? pickRef.current : stage === "sending" ? sendingRef.current : headingRef.current;
    target?.focus();
  }, [stage]);

  const send = async (data: string) => {
    isCancelled.current = false;
    setError("");
    setStage("sending");
    const request = Symbol("rotulo");
    pending.current = request;
    try {
      const reply = await aiRequest("rotulo", LABEL_REQUEST_TEXT, data);
      if (pending.current === request) pending.current = null;
      if (!isMounted.current) return;
      const label = reply.structured?.kind === "rotulo" ? reply.structured.label : null;
      const model = labelReview(label, medKey);
      setReview(model);
      setChoiceId(model.preselected);
      setChoiceMissing(false);
      setStage("review");
    } catch (err) {
      if (pending.current === request) pending.current = null;
      if (!isMounted.current) return;
      if (isCancelled.current) {
        setPhoto(null);
        setStage("pick");
        return;
      }
      setError(err instanceof Error && err.message ? err.message : AGENT_UNAVAILABLE);
      setStage("error");
    }
  };
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // O campo não guarda a foto: o arquivo segue só nesta função até virar o JPEG reduzido.
    input.value = "";
    if (!file) return;
    setPickError("");
    try {
      const data = await readPantryPhoto(file);
      if (!isMounted.current) return;
      setPhoto(data);
      void send(data);
    } catch (err) {
      if (isMounted.current) setPickError(err instanceof Error ? err.message : LABEL_PHOTO_ERRORS.open);
    }
  };
  const cancel = () => {
    isCancelled.current = true;
    pending.current = null;
    cancelAi();
  };
  const retake = () => {
    setPhoto(null);
    setReview(null);
    setChoiceId(null);
    setStage("pick");
  };
  const close = () => {
    if (stage === "sending") cancel();
    setPhoto(null);
    onClose();
  };
  const manual = () => {
    setPhoto(null);
    onManual();
  };
  const confirm = () => {
    const chosen = review?.choices.find((c) => c.id === choiceId);
    if (!chosen) {
      setChoiceMissing(true);
      return;
    }
    setPhoto(null);
    onConfirm(chosen.concentration);
  };

  const single = review?.state === "single" ? review.choices[0] : null;
  return (
    <Modal title="Ler rótulo do frasco" onClose={close} className="label-sheet">
      <div className="label-read">
        {stage === "pick" && (
          <div className="label-pick">
            <p>
              Fotografe o rótulo com a concentração (mg/ml) bem legível. A foto vai só para a leitura pelo agente e
              não fica salva no app.
            </p>
            <label className="btn label-pick-btn">
              <Camera size={18} aria-hidden="true" />
              {PICK_LABEL}
              <input
                ref={pickRef}
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                aria-label={PICK_LABEL}
                onChange={(e) => void pick(e)}
              />
            </label>
            {pickError && (
              <p role="alert" className="field-error">
                {pickError}
              </p>
            )}
          </div>
        )}
        {stage === "sending" && (
          <div className="label-sending" ref={sendingRef} tabIndex={-1}>
            {photo && <img className="label-thumb" src={photo} alt="" />}
            <AiProgress title="Lendo o rótulo" progress={aiStage} mode="rotulo" onCancel={cancel} />
          </div>
        )}
        {stage === "review" && review && (
          <div className="label-review">
            {photo && <img className="label-photo" src={photo} alt="Foto do rótulo enviada para leitura" />}
            <div className="label-result">
              <h3 ref={headingRef} tabIndex={-1}>
                {review.title}
              </h3>
              {single && <ChoiceDetail choice={single} />}
              {review.state === "multiple" && (
                <div className="label-choices" role="radiogroup" aria-label="Concentrações encontradas">
                  {review.choices.map((choice) => (
                    <label key={choice.id} className="label-choice">
                      <input
                        type="radio"
                        name={groupName}
                        aria-label={choice.radioLabel}
                        checked={choiceId === choice.id}
                        onChange={() => {
                          setChoiceId(choice.id);
                          setChoiceMissing(false);
                        }}
                      />
                      <span className="label-choice-copy">
                        <strong>{choice.text}</strong>
                        <span>no rótulo “{choice.printed}”</span>
                        <span className="label-chip">{choice.confidence}</span>
                        {choice.roundedNote && <span className="label-rounded">{choice.roundedNote}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {review.state === "none" && <p>Não encontrei a concentração com segurança nesta foto.</p>}
              {review.nameLine && <p className="muted">{review.nameLine}</p>}
              {review.medicationWarning && (
                <p role="note" className="label-warning">
                  {review.medicationWarning}
                </p>
              )}
              {review.problems.map((problem) => (
                <p key={problem} className="label-problem">
                  {problem}
                </p>
              ))}
              {review.state === "none" ? (
                <div className="label-actions">
                  <button type="button" className="btn-secondary" onClick={retake}>
                    Tirar outra foto
                  </button>
                  <button type="button" className="btn-secondary" onClick={manual}>
                    Digitar a concentração
                  </button>
                </div>
              ) : (
                <>
                  <div className="label-actions">
                    <button type="button" className="btn" aria-disabled={!choiceId} onClick={confirm}>
                      {review.confirmLabel}
                    </button>
                    {isChoiceMissing && (
                      <p role="alert" className="label-choice-hint">
                        Escolha a concentração que está no frasco.
                      </p>
                    )}
                    <button type="button" className="btn-secondary" onClick={manual}>
                      Não é isso: digitar
                    </button>
                    <button type="button" className="text-btn label-retake" onClick={retake}>
                      Tirar outra foto
                    </button>
                  </div>
                  <p className="hint">
                    Confira no frasco antes de usar. O valor só entra na calculadora depois da sua confirmação.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        {stage === "error" && (
          <div className="label-result">
            <h3 ref={headingRef} tabIndex={-1}>
              Não foi possível ler o rótulo agora
            </h3>
            <p className="muted">{error}</p>
            <div className="label-actions">
              {photo && (
                <button type="button" className="btn" onClick={() => void send(photo)}>
                  Tentar de novo
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={manual}>
                Digitar a concentração
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
