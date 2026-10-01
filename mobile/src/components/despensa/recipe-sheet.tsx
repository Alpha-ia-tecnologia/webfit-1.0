import { ChefHat, PackageMinus } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import {
  COOK_COPY,
  newTimer,
  pauseTimer,
  resetTimer,
  startTimer,
  timerView,
  type StepTimer as Timer,
} from "@shared/lib/cook-timer";
import { localDate } from "@shared/lib/domain";
import { kitchenBasic } from "@shared/lib/kitchen-basics";
import { deductRows } from "@shared/lib/pantry-deduct";
import { pantryEmoji } from "@shared/lib/pantry-view";
import { RECIPE_EXPIRED_ITEM, RECIPE_REMOVED_ITEM, stepExtras, type RecipeCoverage } from "@shared/lib/recipe-set";
import { visiblePlainText } from "@shared/lib/text";
import type { RecipeCard } from "@shared/types";
import { AppText, Button, IconTile, Sheet } from "@/components/ui";
import { successHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { CookStep } from "./cook-step";
import { focusWithin } from "./focus";
import { useRecipeActions } from "./recipe-actions";
import { RecipeChips, StepExtras } from "./recipe-chips";
import type { TimerAction } from "./step-timer";
import { useKeepAwakeWhile } from "./use-keep-awake";

/** Redesenho do timer enquanto conta. */
const TICK_MS = 1000;
type Timers = Readonly<Record<number, Timer>>;

const EXPIRED_HINT = "Um ingrediente venceu: gere novas receitas.";

type Props = {
  visible: boolean;
  card: RecipeCard;
  /** Nome já mascarado (título do painel). */
  name: string;
  coverage: RecipeCoverage;
  hide: boolean;
  onClose: () => void;
};

/**
 * Receita completa num painel e o modo preparo em tela cheia (AGENTE-11): um passo por tela, timer
 * por passo (continua entre passos e zera ao sair do modo), tela acesa e, no último passo,
 * "Descontar da despensa". O título de cada passo recebe o foco.
 */
export function RecipeSheet({ visible, card, name, coverage, hide, onClose }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const actions = useRecipeActions();
  /** null = receita completa; senão o índice do passo no modo preparo. */
  const [step, setStep] = useState<number | null>(null);
  const [timers, setTimers] = useState<Timers>({});
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  /** Passos cujo fim já foi anunciado (uma vez por contagem). */
  const announced = useRef(new Set<number>());
  const heading = useRef<View>(null);
  const start = useRef<View>(null);
  const isReturning = useRef(false);
  /** iOS: "Descontar da despensa" guardado até esta folha terminar de sair (onDismiss). */
  const pendingDeduct = useRef<(() => void) | null>(null);
  const show = (text: string) => visiblePlainText(text, hide);
  const isCooking = visible && step !== null;
  const awake = useKeepAwakeWhile(isCooking);
  // Cada abertura e cada saída do modo preparo começam sem timers.
  const clearTimers = () => {
    setTimers({});
    setAnnouncement("");
    announced.current.clear();
  };
  // Abrir começa na receita completa; fechar (Fechar, voltar do Android, "Descontar da despensa") sai do
  // modo preparo e zera os timers: nada conta, redesenha ou vibra com a folha fechada.
  useEffect(() => {
    setStep(null);
    setTimers((current) => (Object.keys(current).length ? {} : current));
    setAnnouncement("");
    announced.current.clear();
  }, [visible]);
  useEffect(() => {
    if (step !== null) focusWithin(heading.current, '[role="heading"]');
    else if (isReturning.current) {
      isReturning.current = false;
      focusWithin(start.current);
    }
  }, [step]);
  // Só no modo preparo aberto: fora dele nenhum timer conta, mesmo antes de o efeito acima zerá-los.
  const isRunning = isCooking && Object.values(timers).some((timer) => timerView(timer, now).state === "running");
  // Redesenha a cada segundo só enquanto algum timer conta; o tempo vem sempre de Date.now().
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [isRunning]);
  // Fim de um timer: um anúncio e uma vibração leve, uma vez (sem som), só com o modo preparo à vista.
  useEffect(() => {
    if (!isCooking) return;
    for (const [key, timer] of Object.entries(timers)) {
      const index = Number(key);
      if (timerView(timer, now).state !== "done" || announced.current.has(index)) continue;
      announced.current.add(index);
      setAnnouncement(COOK_COPY.done(index + 1));
      successHaptic();
    }
  }, [timers, now, isCooking]);
  const backToRecipe = () => {
    isReturning.current = true;
    clearTimers();
    setStep(null);
  };
  const onTimer = (index: number, minutes: number, action: TimerAction) => {
    const at = Date.now();
    const current = timers[index] ?? newTimer(minutes);
    const next = action === "start" ? startTimer(current, at) : action === "pause" ? pauseTimer(current, at) : resetTimer(current);
    setNow(at);
    setTimers({ ...timers, [index]: next });
    if (action === "reset") announced.current.delete(index);
    if (action === "start" && current.elapsedSec === 0 && current.startedAt === null)
      setAnnouncement(COOK_COPY.started(index + 1, minutes));
    else if (action === "pause") setAnnouncement(COOK_COPY.paused);
  };
  const total = card.passos.length;
  // Um item da casa venceu: nada de modo preparo com ele (o painel ainda mostra a receita).
  const hasExpired = coverage.expiredIds.length > 0;
  const isLast = step !== null && step === total - 1;
  // Só oferece descontar quando algum item da casa da receita ainda está na despensa.
  const canDeduct = !!actions && isLast && deductRows(card, state.pantry, localDate()).length > 0;
  // No iOS, apresentar uma folha enquanto outra sai pode ser ignorado: o painel de descontar só abre
  // quando esta terminou de sair. No Android e no web ele abre na hora, como antes.
  const deduct = () => {
    if (!actions) return;
    onClose();
    if (Platform.OS === "ios") pendingDeduct.current = () => actions.deduct(card, name);
    else actions.deduct(card, name);
  };
  const onDismiss = () => {
    const open = pendingDeduct.current;
    pendingDeduct.current = null;
    open?.();
  };
  const footer =
    step === null ? (
      <View ref={start} collapsable={false} style={styles.startBox}>
        {hasExpired && (
          <AppText size={fontSize.xs} color={colors.muted} align="center" testID="recipe-expired-hint">
            {EXPIRED_HINT}
          </AppText>
        )}
        <Button label="Começar modo preparo" icon={ChefHat} wide disabled={hasExpired} onPress={() => setStep(0)} />
      </View>
    ) : (
      <View style={styles.startBox}>
        <View style={styles.stepActions}>
          <Button label="Passo anterior" variant="secondary" disabled={step === 0} onPress={() => setStep(step - 1)} style={styles.flex} />
          {step < total - 1 ? (
            <Button label="Próximo passo" onPress={() => setStep(step + 1)} style={styles.flex} />
          ) : (
            <Button label="Concluir preparo" onPress={backToRecipe} style={styles.flex} />
          )}
        </View>
        {canDeduct ? (
          <Button label={COOK_COPY.deduct} icon={PackageMinus} variant="secondary" wide onPress={deduct} />
        ) : null}
      </View>
    );
  const current = step === null ? null : card.passos[step];
  return (
    <Sheet visible={visible} title={name} onClose={onClose} onDismiss={onDismiss} footer={footer} immersive={step !== null}>
      <View testID="recipe-sheet" style={styles.content}>
        {step === null || !current ? (
          <FullRecipe card={card} coverage={coverage} show={show} />
        ) : (
          <CookStep
            step={step}
            total={total}
            text={show(current.texto)}
            extras={stepExtras(current)}
            timerMin={current.timerMin}
            timer={timers[step] ?? null}
            now={now}
            awake={awake}
            announcement={announcement}
            headingRef={heading}
            onTimer={(action) => current.timerMin !== null && onTimer(step, current.timerMin, action)}
            onFullRecipe={backToRecipe}
          />
        )}
      </View>
    </Sheet>
  );
}

type ItemNote = { text: string; isExpired: boolean };

/** Rótulo do item da casa indisponível: vencido (ainda na despensa) ou removido. */
function unavailableNote(id: string, coverage: RecipeCoverage): ItemNote | null {
  if (coverage.expiredIds.includes(id)) return { text: RECIPE_EXPIRED_ITEM, isExpired: true };
  if (coverage.unavailableIds.includes(id)) return { text: RECIPE_REMOVED_ITEM, isExpired: false };
  return null;
}

function FullRecipe({ card, coverage, show }: { card: RecipeCard; coverage: RecipeCoverage; show: (text: string) => string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <>
      <RecipeChips card={card} />
      <AppText size={fontSize.base} color={colors.text2}>
        {show(card.compatibilidade)}
      </AppText>
      <Section title="Na sua cozinha">
        {card.ingredientesCasa.map((item) => (
          <Item
            key={item.pantryItemId}
            lead={<IconTile size="sm" glyph={pantryEmoji(item.nome)} />}
            text={show(item.nome)}
            amount={item.quantidade ? show(item.quantidade) : null}
            note={unavailableNote(item.pantryItemId, coverage)}
          />
        ))}
      </Section>
      {card.basicos.length > 0 && (
        <Section title="Básicos da cozinha">
          {card.basicos.map(({ basico, quantidade }) => {
            const basic = kitchenBasic(basico);
            return (
              <Item
                key={basico}
                lead={
                  <AppText size={fontSize.base} aria-hidden accessibilityElementsHidden importantForAccessibility="no">
                    {basic.emoji}
                  </AppText>
                }
                text={basic.label}
                amount={quantidade ? show(quantidade) : null}
              />
            );
          })}
        </Section>
      )}
      {card.faltaComprar.length > 0 && (
        <Section title="Falta comprar">
          {card.faltaComprar.map((item, i) => (
            <Item key={i} text={show(item.nome)} amount={item.quantidade ? show(item.quantidade) : null} />
          ))}
        </Section>
      )}
      <Section title="Modo de preparo">
        {card.passos.map((step, i) => (
          <View key={i} role="listitem" style={styles.step}>
            <View style={styles.stepNumber} aria-hidden>
              <AppText size={fontSize.xs} weight={800} color={colors.green800}>
                {String(i + 1)}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText size={fontSize.base}>{show(step.texto)}</AppText>
              <StepExtras extras={stepExtras(step)} />
            </View>
          </View>
        ))}
      </Section>
      {card.porcao ? (
        <View style={styles.section}>
          <SectionTitle text="Porção" />
          <AppText size={fontSize.base} color={colors.text2}>
            {show(card.porcao)}
          </AppText>
        </View>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <SectionTitle text={title} />
      <View role="list" accessibilityLabel={title} style={styles.list}>
        {children}
      </View>
    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
      {text}
    </AppText>
  );
}

function Item({ lead, text, amount, note = null }: { lead?: ReactNode; text: string; amount: string | null; note?: ItemNote | null }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  return (
    <View role="listitem" style={styles.item}>
      {lead}
      <AppText size={fontSize.base} style={styles.flex}>
        {text}
        {amount ? (
          <AppText size={fontSize.sm} color={colors.muted}>
            {` — ${amount}`}
          </AppText>
        ) : null}
        {note ? (
          <AppText size={fontSize.sm} weight={note.isExpired ? 600 : 400} color={note.isExpired ? domainTone.warn.fg : colors.muted}>
            {` · ${note.text}`}
          </AppText>
        ) : null}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 8 },
  list: { gap: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 10 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint100,
  },
  stepActions: { flexDirection: "row", gap: 8 },
  startBox: { gap: 6 },
}));
