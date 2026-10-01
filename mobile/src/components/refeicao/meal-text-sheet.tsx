import { Sparkles } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { MEAL_TEXT_COPY, MEAL_TEXT_MAX_CHARS, type MealText } from "@shared/lib/meal-text";
import { maskStructured } from "@shared/lib/structured";
import { visiblePlainText } from "@shared/lib/text";
import { AiProgress, AppText, Button, Notice, Sheet, SheetNotice, TextField, useSheetNotice } from "@/components/ui";
import { useIosAnnouncement } from "@/lib/announce";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { DictationButton, useOnDeviceDictation } from "./dictation-button";
import { MealTextDraft, type MealTextSelection } from "./meal-text-draft";

const MIN_CHARS = 3;
const HINT_ID = "meal-text-hint";
const COUNTER_ID = "meal-text-counter";

/** O que a folha mostra depois de "Organizar itens". */
type Outcome =
  | { kind: "draft"; draft: MealText; source: string }
  | { kind: "urgent"; text: string }
  | { kind: "text"; text: string };

/** Junta o ditado ao texto com um espaço, sem passar do limite. */
const appendText = (text: string, spoken: string) =>
  (text.trim() ? `${text.trimEnd()} ${spoken}` : spoken).slice(0, MEAL_TEXT_MAX_CHARS);

type Props = {
  allergyDetails: string;
  hideCalories: boolean;
  onAdd: (selections: MealTextSelection[]) => void;
  /** "Buscar {item}": fecha a folha e leva o nome para a busca. */
  onSearch: (name: string) => void;
  onClose: () => void;
};

/**
 * "Descrever refeição" (DIARIO-07): a pessoa escreve (ou dita, só no aparelho) o que comeu; o texto
 * vai ao agente apenas no toque em "Organizar itens" (com autorização e conexão) e volta como itens
 * para conferir. Urgência mostra só o aviso de segurança; sem itens estruturados, o texto e a busca.
 * Falha do agente e notas da resposta aparecem dentro da folha (o aviso ficaria sob ela).
 */
export function MealTextSheet({ allergyDetails, hideCalories, onAdd, onSearch, onClose }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, aiReady, aiBusy, aiStage, aiRequest, cancelAi, notify } = useApp();
  const sheetNotice = useSheetNotice(notify);
  const consentAi = state.profile?.consentAi ?? false;
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isOrganizing, setOrganizing] = useState(false);
  const [canDictate, setCanDictate] = useOnDeviceDictation();
  const [dictationNote, setDictationNote] = useState("");
  // A região viva abaixo anuncia no Android e no web; no iOS, o leitor de tela fala a frase.
  useIosAnnouncement(dictationNote);
  /** false depois de fechar: a resposta ou o cancelamento que chegam depois são ignorados. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isBlocked = !aiReady || !consentAi;
  const trimmed = text.trim();
  const canOrganize = trimmed.length >= MIN_CHARS && !isBlocked && !aiBusy;

  const organize = async () => {
    if (!canOrganize) return;
    setOrganizing(true);
    sheetNotice.clear();
    try {
      const reply = await aiRequest("meal_text", trimmed);
      if (!mounted.current) return;
      if (reply.meta.urgency === "imediata") setOutcome({ kind: "urgent", text: reply.text });
      else if (reply.structured?.kind === "meal_text")
        setOutcome({
          kind: "draft",
          draft: maskStructured(reply.structured.draft, hideCalories, { plain: true }),
          source: trimmed,
        });
      else setOutcome({ kind: "text", text: visiblePlainText(reply.text, hideCalories) });
      if (reply.meta.notes.length) sheetNotice.show(reply.meta.notes.join(" "), "info");
    } catch (error) {
      if (!mounted.current) return;
      sheetNotice.show(error instanceof Error ? error.message : "Não foi possível organizar a descrição.", "warning");
    } finally {
      if (mounted.current) setOrganizing(false);
    }
  };
  const close = () => {
    mounted.current = false;
    if (isOrganizing) cancelAi();
    onClose();
  };
  const back = () => {
    sheetNotice.clear();
    setOutcome(null);
  };

  const compose = (
    <View style={styles.stack}>
      <View style={styles.field}>
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          {MEAL_TEXT_COPY.field}
        </AppText>
        <View style={styles.inputRow}>
          <TextField
            multiline
            numberOfLines={4}
            maxLength={MEAL_TEXT_MAX_CHARS}
            value={text}
            onChangeText={setText}
            placeholder={MEAL_TEXT_COPY.placeholder}
            accessibilityLabel={MEAL_TEXT_COPY.field}
            {...({ "aria-describedby": `${HINT_ID} ${COUNTER_ID}` } as object)}
            style={styles.input}
          />
          {canDictate ? (
            <DictationButton
              disabled={isOrganizing}
              onTranscript={(spoken) => {
                setDictationNote("");
                setText((current) => appendText(current, spoken));
              }}
              onUnavailable={(message) => {
                setCanDictate(false);
                setDictationNote(message);
              }}
              onError={setDictationNote}
            />
          ) : null}
        </View>
        <View style={styles.hintRow}>
          <AppText id={HINT_ID} size={fontSize.xs} color={colors.muted} lineHeight={18} style={styles.hint}>
            {MEAL_TEXT_COPY.hint}
          </AppText>
          <AppText id={COUNTER_ID} size={fontSize.xs} color={colors.muted} aria-live="off" style={styles.counter}>
            {`${text.length}/${MEAL_TEXT_MAX_CHARS}`}
          </AppText>
        </View>
      </View>
      {dictationNote ? (
        <AppText size={fontSize.xs} weight={600} color={colors.amber900} lineHeight={18} accessibilityLiveRegion="polite">
          {dictationNote}
        </AppText>
      ) : null}
      {!canDictate ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          {MEAL_TEXT_COPY.keyboardHint}
        </AppText>
      ) : null}
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
        {MEAL_TEXT_COPY.privacy}
      </AppText>
      {isBlocked ? <Notice tone="attention">{MEAL_TEXT_COPY.blocked}</Notice> : null}
    </View>
  );
  const composeFooter = (
    <View style={styles.actions}>
      <Button
        label={aiBusy ? "Aguarde…" : MEAL_TEXT_COPY.organize}
        icon={Sparkles}
        wide
        disabled={!canOrganize}
        onPress={() => void organize()}
      />
      <Button label="Cancelar" variant="secondary" wide onPress={close} />
    </View>
  );

  let body = compose;
  if (isOrganizing)
    body = <AiProgress title={MEAL_TEXT_COPY.busy} mode="meal_text" progress={aiStage} onCancel={cancelAi} />;
  else if (outcome?.kind === "draft")
    body = (
      <MealTextDraft
        draft={outcome.draft}
        source={outcome.source}
        allergyDetails={allergyDetails}
        onAdd={onAdd}
        onBack={back}
        onSearch={onSearch}
      />
    );
  else if (outcome)
    body = (
      <View style={styles.stack}>
        {outcome.kind === "urgent" ? (
          <View role="alert" style={styles.urgent}>
            <AppText size={fontSize.sm} weight={600} lineHeight={21} color={colors.amber900}>
              {outcome.text}
            </AppText>
          </View>
        ) : (
          <Notice>
            <AppText size={fontSize.sm} lineHeight={22} color={colors.green800}>
              {outcome.text}
            </AppText>
            <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
              {MEAL_TEXT_COPY.textOnly}
            </AppText>
          </Notice>
        )}
        <Button label={MEAL_TEXT_COPY.back} variant="secondary" wide onPress={back} />
      </View>
    );

  return (
    <Sheet visible title={MEAL_TEXT_COPY.title} onClose={close} footer={!isOrganizing && !outcome ? composeFooter : undefined}>
      {isOrganizing ? null : <SheetNotice notice={sheetNotice.notice} />}
      {body}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  stack: { gap: 12 },
  field: { gap: 7 },
  inputRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  input: { flex: 1, minWidth: 0, width: "auto" },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  hint: { flex: 1, minWidth: 0 },
  counter: { flexShrink: 0, fontVariant: ["tabular-nums"] },
  actions: { gap: 10 },
  // Aviso de segurança: âmbar (atenção), nunca o vermelho de erro.
  urgent: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.amberBorder,
    backgroundColor: colors.amber50,
  },
}));
