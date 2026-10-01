import { useEffect, useRef, useState } from "react";
import { Switch, View, useWindowDimensions } from "react-native";
import {
  ArrowRight,
  CalendarCheck,
  ChevronLeft,
  Dumbbell,
  HeartPulse,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Sprout,
} from "lucide-react-native";
import { HABIT_SUGGESTIONS } from "@shared/data/habit-suggestions";
import { STARTER_GOALS } from "@shared/lib/starter";
import { LogoMark } from "@/components/brand/logo";
import { RestoreBackup } from "@/components/restore-backup";
import { AppText, Button, Field, IconButton, TextField } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { GoalCard, HabitChoice } from "./starter-options";
import { WelcomeArt } from "./welcome-art";

const GOAL_ICONS = {
  perder: Sprout,
  organizar: CalendarCheck,
  manter: HeartPulse,
  ganhar: Dumbbell,
} as const;

// No app nativo os dados ficam no aparelho (o web diz "neste navegador").
const VALUES = [
  { icon: ListChecks, text: "Água, refeições e combinados em poucos toques." },
  { icon: Sparkles, text: "Um agente que usa sua rotina, só quando você autorizar." },
  { icon: ShieldCheck, text: "Seus dados ficam neste aparelho, sem conta." },
] as const;

const SCREENS = ["Boas-vindas", "Sobre você", "Primeiro passo"] as const;
const TITLES = ["Sua rotina começa aqui", "Sobre você", "Seu primeiro passo"] as const;
const CONSENT_LABEL = "Concordo em salvar minhas respostas e registros neste aparelho.";
// Até esta largura os objetivos ficam em uma coluna (como o @media (max-width: 360px) do web).
const GOALS_ONE_COLUMN_MAX_WIDTH = 360;
const SIDE_SLOT = 44;

type Props = {
  name: string;
  onName: (name: string) => void;
  goal: string;
  onGoal: (goal: string) => void;
  consent: boolean;
  onConsent: (consent: boolean) => void;
  habitIndex: number | null;
  onHabit: (index: number | null) => void;
  error: string;
  busy: boolean;
  onSubmit: () => void;
  onPersonalize: () => void;
  /** A tela trocou: quem rola o conteúdo volta ao topo. */
  onScreenChange?: () => void;
};

/**
 * Primeiro acesso em 3 telas: valor, "sobre você" em cartões e o primeiro passo.
 * O restaurar backup e "Personalizar alimentação" ficam na primeira tela.
 */
export function StarterFlow(props: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { name, goal, error, busy, onSubmit, onScreenChange } = props;
  const [screen, setScreen] = useState(0);
  const [stepError, setStepError] = useState("");
  const heading = useRef<View>(null);
  const isFirstRender = useRef(true);
  // A cada troca de tela, o foco vai para o título (leitores de tela anunciam a nova tela).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onScreenChange?.();
    focusNode(heading.current);
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => {
    if (screen === 1) {
      if (name.trim().length < 2) return setStepError("Informe seu nome.");
      if (!goal) return setStepError("Escolha seu objetivo.");
    }
    setStepError("");
    setScreen((current) => current + 1);
  };
  const back = () => {
    setStepError("");
    setScreen((current) => current - 1);
  };
  return (
    <View style={styles.flow}>
      <View style={styles.top}>
        <View style={styles.slot}>
          {screen > 0 ? (
            <IconButton icon={ChevronLeft} accessibilityLabel="Voltar para a tela anterior" onPress={back} />
          ) : null}
        </View>
        <View
          style={styles.dots}
          accessible
          accessibilityRole="list"
          accessibilityLabel={`Tela ${screen + 1} de 3: ${SCREENS[screen]}`}
        >
          {SCREENS.map((title, index) => (
            <View
              key={title}
              style={[styles.dot, index <= screen && styles.dotOn, index === screen && styles.dotCurrent]}
            />
          ))}
        </View>
        <View style={styles.slot} />
      </View>
      <View style={[styles.screen, screen === 0 && styles.welcome]}>
        {screen === 0 && <LogoMark size={44} />}
        {screen === 0 && <WelcomeArt />}
        <View ref={heading} accessible accessibilityRole="header" tabIndex={-1} style={styles.title}>
          <AppText heading size={fontSize["3xl"]} weight={800} tracking={-0.02} lineHeight={32} align={screen === 0 ? "center" : "left"}>
            {TITLES[screen]}
          </AppText>
        </View>
        {screen === 0 && <WelcomeScreen {...props} onNext={next} />}
        {screen === 1 && <AboutScreen {...props} stepError={stepError} onClearError={() => setStepError("")} onNext={next} />}
        {screen === 2 && <FirstStepScreen {...props} />}
        {screen === 2 && error ? (
          <AppText size={fontSize.xs} color={colors.rose600} accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        {screen === 2 && (
          <Button
            label={busy ? "Salvando…" : "Começar com combinados"}
            size="lg"
            pill
            wide
            disabled={busy}
            onPress={onSubmit}
          />
        )}
      </View>
    </View>
  );
}

function WelcomeScreen({ busy, onPersonalize, onNext }: Props & { onNext: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <>
      <View style={styles.values}>
        {VALUES.map(({ icon: Icon, text }) => (
          <View key={text} style={styles.value}>
            <View style={styles.valueIcon} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon size={18} color={colors.green700} />
            </View>
            <AppText size={fontSize.md} lineHeight={22} color={colors.text2} style={styles.grow}>
              {text}
            </AppText>
          </View>
        ))}
      </View>
      <Button label="Começar" iconRight={ArrowRight} size="lg" pill wide onPress={onNext} />
      <Button label="Personalizar alimentação" variant="text" disabled={busy} style={styles.center} onPress={onPersonalize} />
      <View style={styles.restore}>
        <AppText size={fontSize.xs} color={colors.muted}>
          Já usou o WebFit?
        </AppText>
        <RestoreBackup />
      </View>
    </>
  );
}

type AboutProps = Props & { stepError: string; onClearError: () => void; onNext: () => void };

function AboutScreen({ name, onName, goal, onGoal, stepError, onClearError, onNext }: AboutProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isCompact = useWindowDimensions().width <= GOALS_ONE_COLUMN_MAX_WIDTH;
  return (
    <>
      <Field label="Como você se chama?">
        <TextField
          accessibilityLabel="Como você se chama?"
          value={name}
          maxLength={100}
          autoComplete="given-name"
          returnKeyType="next"
          onChangeText={(text) => {
            onName(text);
            onClearError();
          }}
          // Enter avança como o "Continuar" (e mostra o que falta).
          onSubmitEditing={onNext}
        />
      </Field>
      <View style={styles.group}>
        <AppText weight={600}>O que você quer melhorar?</AppText>
        <View style={styles.goals} accessibilityRole="radiogroup" accessibilityLabel="O que você quer melhorar?">
          {STARTER_GOALS.map(([value, label]) => (
            <GoalCard
              key={value}
              label={label}
              icon={GOAL_ICONS[value]}
              isOn={goal === value}
              isCompact={isCompact}
              onPress={() => {
                onGoal(value);
                onClearError();
              }}
            />
          ))}
        </View>
      </View>
      {stepError ? (
        <AppText size={fontSize.xs} color={colors.rose600} accessibilityRole="alert">
          {stepError}
        </AppText>
      ) : null}
      <Button label="Continuar" iconRight={ArrowRight} size="lg" pill wide onPress={onNext} />
    </>
  );
}

function FirstStepScreen({ habitIndex, onHabit, consent, onConsent }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <>
      <View style={styles.group}>
        <AppText weight={600}>Seu primeiro combinado (opcional)</AppText>
        <View style={styles.habits} accessibilityRole="radiogroup" accessibilityLabel="Seu primeiro combinado (opcional)">
          {HABIT_SUGGESTIONS.map((suggestion, index) => (
            <HabitChoice
              key={suggestion.title}
              title={suggestion.title}
              time={suggestion.timeOfDay}
              isOn={habitIndex === index}
              onPress={() => onHabit(index)}
            />
          ))}
          <HabitChoice title="Escolher depois" isOn={habitIndex === null} onPress={() => onHabit(null)} />
        </View>
      </View>
      <View style={styles.privacy}>
        <View style={styles.consent}>
          <AppText weight={600} lineHeight={20} style={styles.grow}>
            {CONSENT_LABEL}
          </AppText>
          <Switch
            accessibilityLabel={CONSENT_LABEL}
            value={consent}
            onValueChange={onConsent}
            trackColor={{ false: colors.border, true: colors.green500 }}
            thumbColor={colors.white}
          />
        </View>
        <AppText size={fontSize.xs} lineHeight={18} color={colors.muted}>
          Sem conta nem sincronização entre aparelhos. Você pode exportar ou excluir seus dados quando quiser.
        </AppText>
      </View>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  flow: { gap: 16 },
  top: { flexDirection: "row", alignItems: "center" },
  slot: { width: SIDE_SLOT, height: SIDE_SLOT, justifyContent: "center" },
  dots: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.green600 },
  dotCurrent: { width: 22 },
  screen: { gap: 16 },
  welcome: { alignItems: "center" },
  title: { alignSelf: "stretch", outlineWidth: 0 },
  values: { alignSelf: "stretch", gap: 12, marginTop: 4, marginBottom: 8 },
  value: { flexDirection: "row", alignItems: "center", gap: 12 },
  valueIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint50,
  },
  center: { alignSelf: "center" },
  restore: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 12,
    rowGap: 6,
    marginTop: 4,
  },
  group: { gap: 10 },
  goals: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  habits: { gap: 8 },
  privacy: {
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  consent: { flexDirection: "row", alignItems: "center", gap: 14 },
  grow: { flex: 1, minWidth: 0 },
}));
