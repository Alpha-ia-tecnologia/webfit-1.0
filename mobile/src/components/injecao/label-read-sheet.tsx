import { Camera, Images } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import type { MedicationKey } from "@shared/lib/injection";
import { LABEL_PHOTO_ERRORS, LABEL_REQUEST_TEXT } from "@shared/lib/label-read";
import { labelReview, type LabelChoice, type LabelReviewModel } from "@shared/lib/label-review";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AiProgress, AppText, Button, Sheet } from "@/components/ui";
import { pickEphemeralPhoto } from "@/lib/ephemeral-photo";
import { focusNode } from "@/lib/focus";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius } from "@/theme/tokens";
import { useWebAriaDisabled } from "./use-web-aria-disabled";

const TITLE = "Ler rótulo do frasco";
const PHOTO_LABEL = "Foto do rótulo enviada para leitura";
const MANUAL = "Digitar a concentração";
const RETAKE = "Tirar outra foto";
/** Largura da folha a partir da qual a foto fica ao lado da leitura. */
const SIDE_BY_SIDE = 340;

type Phase = "pick" | "sending" | "review" | "error";
type Props = {
  visible: boolean;
  medKey: MedicationKey;
  /** Só depois de "Sim, usar …" ou "Usar a concentração escolhida". */
  onConfirm: (concentration: number) => void;
  onManual: () => void;
  onClose: () => void;
};

function Note({ text, isAttention = false }: { text: string; isAttention?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="note" style={[styles.note, isAttention && styles.noteAttention]}>
      <AppText size={fontSize.sm} lineHeight={20} color={isAttention ? colors.amber700 : colors.text2}>
        {text}
      </AppText>
    </View>
  );
}

/** Rádios das concentrações encontradas: nenhum marcado de início. */
function ChoiceRadios({ choices, value, onChange }: { choices: LabelChoice[]; value: string | null; onChange: (id: string) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Concentrações encontradas" style={styles.choices}>
      {choices.map((choice) => {
        const isOn = choice.id === value;
        return (
          <Pressable
            key={choice.id}
            accessibilityRole="radio"
            accessibilityLabel={choice.radioLabel}
            accessibilityState={{ checked: isOn }}
            aria-checked={isOn}
            onPress={() => onChange(choice.id)}
            style={({ pressed }) => [styles.choice, isOn && styles.choiceOn, pressed && styles.pressed]}
          >
            <View style={[styles.radioDot, isOn && styles.radioDotOn]} />
            <View style={styles.grow}>
              <AppText size={fontSize.base} weight={700}>
                {choice.text}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted}>
                {`No rótulo: “${choice.printed}” · ${choice.confidence}`}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Botão principal que continua tocável quando falta a escolha (aria-disabled + aviso do que falta). */
function ConfirmButton({ label, isDisabled, onPress }: { label: string; isDisabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const ref = useRef<View>(null);
  useWebAriaDisabled(ref, isDisabled);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, isDisabled && styles.primaryIdle, pressed && styles.pressed]}
    >
      <AppText heading size={fontSize.base} weight={700} color={isDisabled ? colors.muted : colors.surface} align="center">
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Folha "Ler rótulo do frasco" (INJECAO-X2): foto de uso único (apagada do cache ao preparar), leitura pelo
 * agente, conferência lado a lado e confirmação obrigatória. Nada entra na calculadora antes de "Sim, usar …";
 * a foto vive só no estado desta folha e some ao tirar outra, confirmar, digitar, fechar ou desmontar.
 */
function OpenLabelReadSheet({ medKey, onConfirm, onManual, onClose }: Omit<Props, "visible">) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { aiRequest, aiStage, cancelAi } = useApp();
  const [phase, setPhase] = useState<Phase>("pick");
  const [photo, setPhoto] = useState<string | null>(null);
  const [review, setReview] = useState<LabelReviewModel | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [error, setError] = useState("");
  const [pickError, setPickError] = useState("");
  const [width, setWidth] = useState(0);
  const heading = useRef<Text>(null);
  // Cada envio tem um número: respostas de um envio cancelado, trocado ou de uma folha fechada são ignoradas.
  const run = useRef(0);
  const isSending = useRef(false);
  // Escolha em andamento (permissão, seletor e a redução da foto): um segundo toque não abre outro seletor.
  const isPickingRef = useRef(false);
  const [isPicking, setPicking] = useState(false);
  // A foto é uma data URL grande: a mesma fonte entre renders (cada etapa do agente redesenha a folha).
  const photoSource = useMemo(() => (photo ? { uri: photo } : null), [photo]);

  useEffect(() => {
    if (phase !== "review" && phase !== "error") return;
    const frame = requestAnimationFrame(() => focusNode(heading.current as unknown as View | null));
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  useEffect(
    () => () => {
      // Folha desmontada no meio da leitura: a solicitação é cancelada (a foto some com o estado).
      run.current += 1;
      if (isSending.current) cancelAi();
    },
    [cancelAi],
  );

  const send = async (image: string) => {
    const id = ++run.current;
    isSending.current = true;
    setPhase("sending");
    setError("");
    try {
      const reply = await aiRequest("rotulo", LABEL_REQUEST_TEXT, image);
      if (run.current !== id) return;
      const read = reply.structured?.kind === "rotulo" ? reply.structured.label : null;
      const model = labelReview(read, medKey);
      setReview(model);
      setChosen(model.preselected);
      setNeedsChoice(false);
      setPhase("review");
    } catch (caught) {
      if (run.current !== id) return;
      setError(caught instanceof Error ? caught.message : "Tente de novo em instantes.");
      setPhase("error");
    } finally {
      if (run.current === id) isSending.current = false;
    }
  };
  const pick = async (source: "camera" | "library") => {
    if (isPickingRef.current) return;
    isPickingRef.current = true;
    setPicking(true);
    setPickError("");
    // Fechar, digitar ou desmontar durante a escolha muda o número: a foto que chega depois é descartada.
    const id = run.current;
    try {
      const image = await pickEphemeralPhoto(source);
      if (!image || run.current !== id) return;
      setPhoto(image);
      void send(image);
    } catch (caught) {
      if (run.current !== id) return;
      setPickError(caught instanceof Error ? caught.message : LABEL_PHOTO_ERRORS.open);
    } finally {
      isPickingRef.current = false;
      if (run.current === id) setPicking(false);
    }
  };
  const stopSending = () => {
    run.current += 1;
    if (isSending.current) cancelAi();
    isSending.current = false;
  };
  const retake = () => {
    stopSending();
    setPhoto(null);
    setReview(null);
    setChosen(null);
    setPhase("pick");
  };
  const close = () => {
    stopSending();
    setPhoto(null);
    onClose();
  };
  const manual = () => {
    stopSending();
    setPhoto(null);
    onManual();
  };
  const confirm = () => {
    const choice = review?.choices.find((c) => c.id === chosen);
    if (!choice) {
      setNeedsChoice(true);
      return;
    }
    setPhoto(null);
    onConfirm(choice.concentration);
  };

  const headingText = (text: string) => (
    <Text ref={heading} accessibilityRole="header" {...webAttrs({ tabIndex: -1 })} style={styles.heading}>
      {text}
    </Text>
  );
  const problems = review?.problems.map((text) => (
    <AppText key={text} size={fontSize.sm} color={colors.text2}>
      {text}
    </AppText>
  ));
  const single = review?.state === "single" ? review.choices[0] : null;
  const details =
    review === null ? null : review.state === "none" ? (
      <>
        {headingText(review.title)}
        <AppText size={fontSize.sm} color={colors.text2}>
          Não encontrei a concentração com segurança nesta foto.
        </AppText>
        {problems}
      </>
    ) : (
      <>
        {headingText(review.title)}
        {single ? (
          <>
            <AppText size={fontSize.sm} color={colors.text2}>
              {`No rótulo: “${single.printed}”`}
            </AppText>
            <View style={styles.chip}>
              <AppText size={fontSize.xs} weight={700} color={colors.text2}>
                {single.confidence}
              </AppText>
            </View>
            {single.roundedNote ? <Note text={single.roundedNote} /> : null}
          </>
        ) : (
          <ChoiceRadios
            choices={review.choices}
            value={chosen}
            onChange={(id) => {
              setChosen(id);
              setNeedsChoice(false);
            }}
          />
        )}
        {review.nameLine ? (
          <AppText size={fontSize.sm} color={colors.text2}>
            {review.nameLine}
          </AppText>
        ) : null}
        {review.medicationWarning ? <Note text={review.medicationWarning} isAttention /> : null}
        {problems}
      </>
    );
  const reviewActions =
    review === null ? null : review.state === "none" ? (
      <>
        <Button label={RETAKE} variant="secondary" onPress={retake} wide />
        <Button label={MANUAL} variant="text" onPress={manual} style={styles.center} />
      </>
    ) : (
      <>
        <ConfirmButton label={review.confirmLabel} isDisabled={chosen === null} onPress={confirm} />
        {needsChoice ? (
          <AppText size={fontSize.sm} color={colors.text2} accessibilityRole="alert">
            Escolha a concentração que está no frasco.
          </AppText>
        ) : null}
        <Button label="Não é isso: digitar" variant="secondary" onPress={manual} wide />
        <Button label={RETAKE} variant="text" onPress={retake} style={styles.center} />
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          Confira no frasco antes de usar. O valor só entra na calculadora depois da sua confirmação.
        </AppText>
      </>
    );
  const isWide = width >= SIDE_BY_SIDE;

  return (
    <Sheet visible title={TITLE} onClose={close}>
      <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={styles.body} testID="label-read">
        {phase === "pick" && (
          <>
            <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
              Fotografe o rótulo com a concentração (mg/ml) bem legível. A foto vai só para a leitura pelo agente e não fica salva no app.
            </AppText>
            <View style={styles.sources}>
              <Button label="Câmera" icon={Camera} variant="secondary" disabled={isPicking} onPress={() => void pick("camera")} style={styles.half} />
              <Button label="Galeria" icon={Images} variant="secondary" disabled={isPicking} onPress={() => void pick("library")} style={styles.half} />
            </View>
            {pickError ? (
              <AppText size={fontSize.sm} color={colors.errorText} accessibilityRole="alert">
                {pickError}
              </AppText>
            ) : null}
          </>
        )}
        {phase === "sending" && (
          <>
            {photoSource ? <Image source={photoSource} style={styles.thumb} resizeMode="cover" accessibilityLabel={PHOTO_LABEL} /> : null}
            <AiProgress title="Lendo o rótulo" mode="rotulo" progress={aiStage} onCancel={retake} />
          </>
        )}
        {phase === "review" && (
          <>
            <View style={isWide ? styles.sideBySide : styles.stacked}>
              {photoSource ? (
                <Image
                  source={photoSource}
                  style={isWide ? styles.photoSide : styles.photoStacked}
                  resizeMode="contain"
                  accessibilityLabel={PHOTO_LABEL}
                />
              ) : null}
              <View style={styles.details}>{details}</View>
            </View>
            {reviewActions}
          </>
        )}
        {phase === "error" && (
          <>
            {headingText("Não foi possível ler o rótulo agora")}
            {error ? (
              <AppText size={fontSize.sm} color={colors.muted}>
                {error}
              </AppText>
            ) : null}
            <Button label="Tentar de novo" onPress={() => (photo ? void send(photo) : retake())} wide />
            <Button label={MANUAL} variant="text" onPress={manual} style={styles.center} />
          </>
        )}
      </View>
    </Sheet>
  );
}

export function LabelReadSheet({ visible, ...props }: Props) {
  return visible ? <OpenLabelReadSheet {...props} /> : null;
}

const useStyles = makeStyles((colors) => ({
  body: { gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  center: { alignSelf: "center" },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  half: { flexGrow: 1, flexBasis: 120 },
  heading: { fontFamily: fontFamily(800, true), fontSize: fontSize.lg, lineHeight: 22, color: colors.text },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  sideBySide: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stacked: { gap: 12 },
  photoSide: { width: "40%", minWidth: 96, aspectRatio: 3 / 4, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  photoStacked: { width: "100%", height: 180, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  details: { flex: 1, minWidth: 0, gap: 8 },
  chip: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  note: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  noteAttention: { borderColor: colors.amberBorder, backgroundColor: colors.amber50 },
  choices: { gap: 8 },
  choice: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceOn: { borderColor: colors.selectedBorder, backgroundColor: colors.chipOnTint },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.slate400 },
  radioDotOn: { borderColor: colors.green700, backgroundColor: colors.green700 },
  primary: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.green700,
  },
  primaryIdle: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.8 },
}));
