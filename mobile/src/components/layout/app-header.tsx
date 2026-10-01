import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import { ArrowLeft, Bell, ChevronLeft } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { localDate } from "@shared/lib/domain";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, IconButton } from "@/components/ui";
import { fmtShortDate } from "@shared/lib/format";
import { initialsOf } from "@/lib/format";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { diagonal, fontSize, gradients, shadows } from "@/theme/tokens";

/**
 * Espelho do HeaderPortal/useHeaderOptions do web (FOUNDATION-API §1): a tela passa as peças direto ao cabeçalho.
 * `actions` = botões da tela à direita, antes do sino (use `IconButton variant="header"`); `hideBell` tira o sino.
 */
/** Rotas em que o cabeçalho não tem sino, como no App do web: Diário (busca e calendário) e Seringa (o guia (i)). */
const NO_BELL_ROUTES: ReadonlySet<string> = new Set(["/diario", "/injecao"]);

type Slots = {
  actions?: ReactNode;
  hideBell?: boolean;
  /** Rolagem do conteúdo: transparente no topo (fundo da página) e em vidro depois de rolar. */
  scrollY?: SharedValue<number>;
};

type Props =
  | { variant: "home"; scrollY?: SharedValue<number> }
  | (Slots & {
      /** Abas da barra inferior: título grande à esquerda, sem voltar. */
      variant: "large";
      title: string;
      subtitle?: string;
      /** Linha curta ACIMA do título (Diário: "Quinta, 24 de setembro"). */
      kicker?: string;
      /** Antes do título (slot "lead" do web: o avatar do Meu agente). */
      lead?: ReactNode;
      extra?: ReactNode;
      /** Nome antigo de `actions` (o calendário do Diário): o mesmo lugar, antes do sino. */
      action?: ReactNode;
    })
  | (Slots & {
      variant: "default";
      title: string;
      subtitle?: string;
      /** Rota de volta; sem valor, usa o histórico. */
      backTo?: string;
      /** Linha extra abaixo do título (ex.: faixa de datas do Diário). */
      extra?: ReactNode;
      /** Slot "center" do web: troca o título VISÍVEL (a pílula do Registro); o título segue como cabeçalho oculto. */
      center?: ReactNode;
      /** "start" = título grande à esquerda (Despensa); padrão, título centrado de 17 px. */
      align?: "center" | "start";
      /** false = sem sino (nome antigo de `hideBell`). */
      showBell?: boolean;
    });

/**
 * Cabeçalho das telas (FOUNDATION-API §1.3): Hoje (avatar, data em cima e saudação grande), abas (título grande)
 * ou telas empilhadas (voltar + título ou o slot central). Sem barra no topo: o fundo é o da página e o vidro
 * com a borda fina aparece depois de rolar (quando a tela passa `scrollY`).
 */
export function AppHeader(props: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { state, unread } = useApp();
  const isHome = props.variant === "home";
  const bell = (
    <IconButton
      icon={Bell}
      variant={isHome ? "headerRound" : "header"}
      accessibilityLabel={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
      badge={unread > 0}
      onPress={() => router.push("/notificacoes")}
    />
  );
  const hideBell =
    props.variant !== "home" &&
    (props.hideBell === true || (props.variant === "default" && props.showBell === false) || NO_BELL_ROUTES.has(pathname));
  const actions = props.variant === "large" ? (props.actions ?? props.action) : props.variant === "default" ? props.actions : null;
  return (
    <View style={[styles.header, isHome && styles.headerHome, { paddingTop: insets.top + 8 }]}>
      <ScrollGlass scrollY={props.scrollY} />
      {props.variant === "home" ? (
        <View style={styles.row}>
          <View style={styles.user}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Meu perfil"
              onPress={() => router.push("/espaco")}
              style={({ pressed }) => [styles.avatarRing, pressed && styles.pressed]}
            >
              <LinearGradient colors={gradients.brand} start={diagonal.start} end={diagonal.end} style={styles.avatarGradient}>
                <View style={styles.avatarInner}>
                  <AppText heading size={fontSize.base} weight={800} tracking={0.02} color={colors.text2}>
                    {initialsOf(state.profile?.name ?? "")}
                  </AppText>
                </View>
              </LinearGradient>
            </Pressable>
            <View style={styles.copy}>
              <AppText size={fontSize.md} weight={600} color={colors.muted} numberOfLines={1} lineHeight={20}>
                {fmtShortDate(localDate())}
              </AppText>
              <HomeGreeting name={state.profile?.name.trim().split(/\s+/)[0] ?? ""} scrollY={props.scrollY} />
            </View>
          </View>
          {bell}
        </View>
      ) : props.variant === "large" ? (
        <>
          <View style={styles.row}>
            <View style={styles.leadRow}>
              {props.lead}
              <LargeTitle title={props.title} subtitle={props.subtitle} kicker={props.kicker} hasLead={!!props.lead} scrollY={props.scrollY} />
            </View>
            {actions}
            {hideBell ? null : bell}
          </View>
          {props.extra ? <View style={styles.extra}>{props.extra}</View> : null}
        </>
      ) : (
        <>
          <View style={styles.row}>
            {/* Com a pílula no centro (Registrar refeição, conceito 02): voltar redondo, com a seta "←". */}
            <IconButton
              icon={props.center ? ArrowLeft : ChevronLeft}
              variant={props.center ? "headerRound" : "header"}
              accessibilityLabel="Voltar"
              onPress={() => {
                if (props.backTo) router.replace(props.backTo as never);
                else if (router.canGoBack()) router.back();
                else router.replace("/");
              }}
            />
            <StackedTitle title={props.title} subtitle={props.subtitle} center={props.center} align={props.align ?? "center"} />
            {actions}
            {hideBell ? (actions || props.align === "start" ? null : <View style={styles.spacer} />) : bell}
          </View>
          {props.extra ? <View style={styles.extra}>{props.extra}</View> : null}
        </>
      )}
    </View>
  );
}

/** Rolagem (px) até o vidro do cabeçalho aparecer por inteiro. */
const GLASS_DISTANCE = 12;

/** Vidro claro com a borda fina (o visual antigo do cabeçalho), só depois de rolar; sem `scrollY`, nunca aparece. */
function ScrollGlass({ scrollY }: { scrollY?: SharedValue<number> }) {
  const styles = useStyles();
  const glassMotion = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (scrollY?.value ?? 0) / GLASS_DISTANCE)),
  }));
  return <Animated.View pointerEvents="none" style={[styles.glass, glassMotion]} testID="header-glass" />;
}

type StackedTitleProps = { title: string; subtitle?: string; center?: ReactNode; align: "center" | "start" };

/** Título das telas empilhadas: centrado (17 px), à esquerda (24 px, Despensa, como o web) ou oculto atrás do slot central. */
function StackedTitle({ title, subtitle, center, align }: StackedTitleProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isStart = align === "start";
  const heading = (
    <AppText
      heading
      size={isStart ? fontSize["2xl"] : fontSize.lg}
      weight={800}
      tracking={isStart ? -0.02 : undefined}
      numberOfLines={1}
      align={isStart ? "left" : "center"}
      accessibilityRole="header"
      lineHeight={isStart ? 30 : 22}
      style={center ? srOnly : undefined}
    >
      {title}
    </AppText>
  );
  if (center)
    return (
      <View style={styles.centerSlot}>
        {heading}
        {center}
      </View>
    );
  return (
    <View style={styles.titleBlock}>
      {heading}
      {subtitle ? (
        <AppText size={fontSize["2xs"]} weight={500} color={colors.muted} numberOfLines={1} align={isStart ? "left" : "center"} lineHeight={16}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

/** Título grande das abas (28 px) e o tamanho compacto a que ele chega ao rolar (17 px). */
const LARGE_SIZE = fontSize["3xl"];
const LARGE_LINE = 32;
const COMPACT_SCALE = fontSize.lg / LARGE_SIZE;
/** Rolagem (px) que leva do título grande ao compacto: a altura da linha do título. */
const COLLAPSE_DISTANCE = LARGE_LINE;

/** 0 = título grande, 1 = compacto; com movimento reduzido, troca de uma vez na metade do caminho. */
function collapseProgress(y: number, isReduced: boolean): number {
  "worklet";
  if (isReduced) return y > COLLAPSE_DISTANCE / 2 ? 1 : 0;
  return Math.min(1, Math.max(0, y / COLLAPSE_DISTANCE));
}

/** Preferência "reduzir movimento" do sistema, acompanhando mudanças com o app aberto. */
function useReduceMotion(): boolean {
  const [isReduced, setReduced] = useState(false);
  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (isMounted) setReduced(value);
      })
      // Sem resposta do sistema, o título segue a rolagem (comportamento padrão).
      .catch(() => {
        if (isMounted) setReduced(false);
      });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);
  return isReduced;
}

/** Linha da saudação do Hoje (34 px para 28 px de fonte). */
const GREETING_LINE = 34;

/**
 * "Olá, Nome." do Hoje: 28 px no topo e 17 px depois de rolar (como o .is-home.is-scrolled do web), pela mesma
 * escala do título das abas; sem `scrollY`, fica sempre grande.
 */
function HomeGreeting({ name, scrollY }: { name: string; scrollY?: SharedValue<number> }) {
  const styles = useStyles();
  const isReduced = useReduceMotion();
  const motion = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY?.value ?? 0, isReduced);
    return { transform: [{ scale: 1 - progress * (1 - COMPACT_SCALE) }] };
  });
  return (
    <Animated.View style={[styles.titleOrigin, motion]}>
      <AppText heading size={fontSize["3xl"]} weight={800} tracking={-0.02} numberOfLines={1} accessibilityRole="header" lineHeight={GREETING_LINE}>
        Olá, {name}.
      </AppText>
    </Animated.View>
  );
}

type LargeTitleProps = { title: string; subtitle?: string; kicker?: string; hasLead: boolean; scrollY?: SharedValue<number> };

/** Com o `lead` (avatar do Meu agente), o título desce para 24 px, como o .header-lead do web. */
/** Com o avatar à esquerda (Meu agente, conceito 05): título de 20 px e o status numa linha. */
const LEAD_SIZE = fontSize.xl;
const LEAD_LINE = 26;

/**
 * Título das abas: encolhe de 28 (ou 24, com o `lead`) para 17 px, escalando a partir da esquerda conforme a
 * rolagem. É sempre o mesmo texto e o único título da tela; nada é duplicado para o leitor de tela.
 * Subtítulo como no web: sem `lead`, 15 px em text-2 (Evolução); com `lead`, 14 px cinza numa linha (status do agente).
 */
function LargeTitle({ title, subtitle, kicker, hasLead, scrollY }: LargeTitleProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isReduced = useReduceMotion();
  const size = hasLead ? LEAD_SIZE : LARGE_SIZE;
  const line = hasLead ? LEAD_LINE : LARGE_LINE;
  const compact = fontSize.lg / size;
  const shrink = line * (1 - compact);
  const titleMotion = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY?.value ?? 0, isReduced);
    return { transform: [{ scale: 1 - progress * (1 - compact) }] };
  });
  const subtitleMotion = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY?.value ?? 0, isReduced);
    return { transform: [{ translateY: (-progress * shrink) / 2 }] };
  });
  const kickerMotion = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY?.value ?? 0, isReduced);
    return { transform: [{ translateY: (progress * shrink) / 2 }] };
  });
  return (
    <View style={styles.largeBlock}>
      {kicker ? (
        <Animated.View style={kickerMotion}>
          <AppText size={fontSize.sm} weight={600} color={colors.muted} numberOfLines={1} lineHeight={18}>
            {kicker}
          </AppText>
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.titleOrigin, titleMotion]} testID="large-title">
        <AppText heading size={size} weight={800} tracking={-0.02} numberOfLines={1} accessibilityRole="header" lineHeight={line}>
          {title}
        </AppText>
      </Animated.View>
      {subtitle ? (
        <Animated.View style={subtitleMotion}>
          <AppText
            size={hasLead ? fontSize.base : fontSize.md}
            weight={hasLead ? 400 : 500}
            color={hasLead ? colors.muted : colors.text2}
            numberOfLines={1}
            lineHeight={20}
          >
            {subtitle}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
    zIndex: 40,
  },
  headerHome: { paddingBottom: 12 },
  /** O vidro de antes (fundo translúcido, borda inferior e sombra), atrás do conteúdo do cabeçalho. */
  glass: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.glassHeader,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassHeaderBorder,
    boxShadow: shadows.header,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  user: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  /** Avatar de 46 px com o anel em gradiente de 2 px. */
  avatarRing: { width: 46, height: 46, borderRadius: 23, boxShadow: shadows.soft },
  avatarGradient: { flex: 1, borderRadius: 23, padding: 2 },
  avatarInner: { flex: 1, borderRadius: 21, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  copy: { flexShrink: 1, minWidth: 0 },
  leadRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  largeBlock: { flex: 1, minWidth: 0, gap: 2 },
  /** O título encolhe preso à margem esquerda, centrado na linha. */
  titleOrigin: { transformOrigin: "left center" },
  titleBlock: { flex: 1, minWidth: 0, gap: 1 },
  centerSlot: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  spacer: { width: 44 },
  extra: { paddingTop: 2 },
  pressed: { transform: [{ scale: 0.95 }] },
}));
