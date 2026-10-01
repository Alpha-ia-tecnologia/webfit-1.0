import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Modal, PanResponder, ScrollView, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { STORY_SLIDE_MS, slideTitles, type WeekRecap } from "@shared/lib/week-recap";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, IconButton } from "@/components/ui";
import { useIosAnnouncement } from "@/lib/announce";
import { makeStyles } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { RecapSlide } from "./recap-slides";
import { ShareTextSheet } from "./share-text-sheet";

const PARTS = 5;
const LAST = PARTS - 1;
/** Segurar a parte pausa; arrasto horizontal: começa depois de 12 pt e troca de parte a partir de 40 pt. */
const SWIPE_START_PX = 12;
const SWIPE_MIN_PX = 40;
const SLIDE_FADE_MS = 300;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;
/** aria-roledescription não está nos tipos do React Native; o react-native-web o repassa ao DOM (no aparelho é ignorado). */
const roleDescription = (text: string): object => ({ "aria-roledescription": text });

/** Preenchimento da parte atual: escala de 0 a 1 a partir da esquerda (só transform). */
function ActiveFill({ progress, isStatic }: { progress: SharedValue<number>; isStatic: boolean }) {
  const styles = useStyles();
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: isStatic ? 1 : progress.value }] }));
  return <Animated.View style={[styles.fill, grow]} />;
}

type Props = { recap: WeekRecap; onClose: () => void };

/**
 * Stories de "Sua semana" (EVOL-05 + SIS-13): 5 partes em tela cheia, avanço automático de 6 s por parte
 * (parado com movimento reduzido, pausado pelo botão, ao segurar, com o app em segundo plano ou com a
 * folha de compartilhar aberta), arrasto horizontal e botões Anterior/Próximo. Montado só enquanto aberto.
 */
export function WeekStories({ recap, onClose }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const isReduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [isPaused, setPaused] = useState(false);
  const [isHeld, setHeld] = useState(false);
  const [isAppActive, setAppActive] = useState(true);
  const [isShareOpen, setShareOpen] = useState(false);
  const titles = slideTitles(recap);
  const isPlaying = !isReduced && !isPaused && !isHeld && isAppActive && !isShareOpen;
  const progress = useSharedValue(0);
  // Quanto falta da parte atual (a pausa guarda o resto; a troca de parte volta aos 6 s).
  const remaining = useRef(STORY_SLIDE_MS);
  const next = () => setIndex((i) => Math.min(LAST, i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => setAppActive(status === "active"));
    return () => subscription.remove();
  }, []);
  // Nova parte: o preenchimento recomeça do zero (roda antes do efeito do avanço, declarado depois).
  useEffect(() => {
    remaining.current = STORY_SLIDE_MS;
    cancelAnimation(progress);
    progress.value = 0;
  }, [index, progress]);
  // Um único setTimeout avança; a animação só desenha. Na última parte, nada avança.
  useEffect(() => {
    if (!isPlaying) return;
    const ms = Math.max(0, remaining.current);
    progress.value = withTiming(1, { duration: ms, easing: Easing.linear });
    const timer = index < LAST ? setTimeout(() => setIndex((i) => Math.min(LAST, i + 1)), ms) : null;
    return () => {
      if (timer) clearTimeout(timer);
      cancelAnimation(progress);
      remaining.current = (1 - progress.value) * STORY_SLIDE_MS;
    };
  }, [isPlaying, index, progress]);

  // Criado uma vez: só usa os setters (estáveis) com atualização funcional. Segurar a parte (toque fora
  // dos botões dela) pausa o avanço até soltar. Na captura (como a faixa da semana do Hoje): o arrasto
  // horizontal vale mesmo começando sobre um texto ou um botão da parte. A rolagem vertical pode tomar o
  // gesto (a pausa acaba em onPanResponderTerminate).
  const swipe = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_event, g) => Math.abs(g.dx) > SWIPE_START_PX && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => setHeld(true),
      onPanResponderRelease: (_event, g) => {
        setHeld(false);
        if (g.dx <= -SWIPE_MIN_PX) setIndex((i) => Math.min(LAST, i + 1));
        else if (g.dx >= SWIPE_MIN_PX) setIndex((i) => Math.max(0, i - 1));
      },
      onPanResponderTerminate: () => setHeld(false),
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  const title = titles[index] ?? "";
  const partText = `Parte ${index + 1} de ${PARTS}: ${title}`;
  // Troca de parte fora do avanço automático: região viva no Android e no web; no iOS, o leitor de tela fala.
  useIosAnnouncement(partText, !isPlaying);
  return (
    <Modal
      visible
      transparent={false}
      animationType={isReduced ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <View style={styles.progress} {...HIDDEN}>
          {Array.from({ length: PARTS }, (_, i) => (
            <View key={i} style={styles.track}>
              {i < index && <View style={styles.fill} />}
              {i === index && <ActiveFill progress={progress} isStatic={isReduced} />}
            </View>
          ))}
        </View>
        <View style={styles.head}>
          <AppText heading size={fontSize.xl} weight={800} accessibilityRole="header" style={styles.grow}>
            Sua semana
          </AppText>
          {!isReduced && (
            <IconButton
              icon={isPaused ? Play : Pause}
              accessibilityLabel={isPaused ? "Retomar avanço automático" : "Pausar avanço automático"}
              onPress={() => setPaused((paused) => !paused)}
            />
          )}
          <IconButton icon={X} accessibilityLabel="Fechar" onPress={onClose} />
        </View>
        <AppText style={srOnly} accessibilityLiveRegion={isPlaying ? "none" : "polite"}>
          {partText}
        </AppText>
        <View role="region" aria-label={`Sua semana em ${PARTS} partes`} {...roleDescription("carrossel")} style={styles.stage}>
          <ScrollView key={index} contentContainerStyle={styles.stageContent} showsVerticalScrollIndicator={false}>
            <Animated.View entering={isReduced ? undefined : FadeIn.duration(SLIDE_FADE_MS)} style={styles.fillStage}>
              <View
                role="group"
                aria-label={`${index + 1} de ${PARTS}: ${title}`}
                {...roleDescription("parte")}
                testID="story-slide"
                style={styles.slide}
                {...swipe.panHandlers}
              >
                <RecapSlide recap={recap} index={index} onShare={() => setShareOpen(true)} />
              </View>
            </Animated.View>
          </ScrollView>
        </View>
        <View style={styles.controls}>
          <Button label="Anterior" variant="secondary" icon={ChevronLeft} disabled={index === 0} onPress={prev} style={styles.control} />
          {index < LAST ? (
            <Button label="Próximo" iconRight={ChevronRight} onPress={next} style={styles.control} />
          ) : (
            <Button label="Concluir" onPress={onClose} style={styles.control} />
          )}
        </View>
      </View>
      <ShareTextSheet visible={isShareOpen} recap={recap} onClose={() => setShareOpen(false)} />
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, paddingHorizontal: 16, gap: 12, backgroundColor: colors.bg },
  progress: { flexDirection: "row", gap: 4 },
  track: { flex: 1, height: 4, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.border },
  fill: { width: "100%", height: "100%", borderRadius: radius.pill, backgroundColor: colors.marker, transformOrigin: "left" },
  head: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  grow: { flex: 1, minWidth: 0 },
  stage: { flex: 1, minHeight: 0 },
  stageContent: { paddingVertical: 8, flexGrow: 1 },
  // A parte ocupa todo o palco: o arrasto funciona em qualquer ponto dele.
  fillStage: { flexGrow: 1 },
  // No export web, arrastar com o mouse sobre o texto o selecionaria, e a seleção encerra o gesto.
  slide: { flexGrow: 1, userSelect: "none" },
  controls: { flexDirection: "row", gap: 12 },
  control: { flex: 1 },
}));
