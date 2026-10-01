import { ChevronRight, CircleCheck, Smile, Syringe } from "lucide-react-native";
import { useState, type Ref } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { cycleCard } from "@shared/lib/cycle-tips";
import { localDate } from "@shared/lib/domain";
import { daysAgoLabel, injectionTitle, spotLabel } from "@shared/lib/injection";
import type { InjectionCardModel } from "@shared/lib/treatment";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { BodyMapMini } from "@/components/injecao/body-map-mini";
import { NextDoseRing } from "@/components/injecao/next-dose-ring";
import { CycleSheet, CycleTipBlock } from "@/components/injecao/cycle-tips";
import { AppText, Button, Card } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontFamily, fontSize, radius, themeDomainTone } from "@/theme/tokens";

type Props = {
  model: InjectionCardModel;
  onOpen: () => void;
  onRegister: () => void;
  onMood: () => void;
  /** Título do card: recebe o foco depois de registrar pelo Hoje (o botão promovido some). */
  headingRef?: Ref<Text>;
};

/** Anel da próxima dose no Hoje (78 px, como o web); abaixo de 360 px de tela, 64 px (o @media do web). */
const RING_SIZE = 78;
const RING_SIZE_NARROW = 64;
const NARROW_SCREEN = 360;
/** Traços da linha tracejada acima de "Seu ciclo da semana" (4 px de traço, 3 de folga; a sobra fica oculta). */
const DASHES = 60;

/** Linha tracejada de 1 px (border-top dashed do web; no Android a borda de um lado só não fica tracejada). */
function DashedRule() {
  const styles = useStyles();
  return (
    <View style={styles.rule} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {Array.from({ length: DASHES }, (_, i) => (
        <View key={i} style={styles.dash} />
      ))}
    </View>
  );
}

/**
 * Caneta no Hoje (InjectionCard do web, HOJE-05) como widget: anel da próxima dose estimada, o remédio,
 * "Próxima: terça, 29", a última aplicação e o mapa com o local sugerido (que abre "Calcular dose e registrar").
 * Só informativo: nunca sugere dose. No dia estimado, com receita recente, "Registrar aplicação" aparece.
 */
export function InjectionCard({ model, onOpen, onRegister, onMood, headingRef }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  const [isCycleOpen, setCycleOpen] = useState(false);
  const [isPhasesOpen, setPhasesOpen] = useState(false);
  const { state } = useApp();
  const { width } = useWindowDimensions();
  const ringSize = width < NARROW_SCREEN ? RING_SIZE_NARROW : RING_SIZE;
  const { summary, next, text, variant } = model;
  // "Seu ciclo da semana" (SERINGA-11): só na estimativa; cycleCard já barra gestação, menores e não semanal.
  const cycle =
    variant === "estimate" && state.profile
      ? cycleCard({ profile: state.profile, injections: state.injections, diary: state.diary, today: localDate() })
      : null;
  const last = summary.last;
  const lastSpot = last ? spotLabel(last.site, last.side ?? null) : "";
  const suggestedSpot = spotLabel(summary.suggestedSite, summary.suggestedSide);
  const isEstimate = variant === "estimate" && !!next && !!text && !!last;
  const title = last ? injectionTitle(last) : "Medicação injetável";
  const lines = isEstimate
    ? { next: text.short, last: `Última ${daysAgoLabel(summary.daysSinceLast)} · ${lastSpot.toLowerCase()}`, hint: text.hint }
    : variant === "first"
      ? { next: "Nenhuma aplicação ainda", last: model.tracks ? "Registre a primeira para estimar a próxima dose." : null, hint: null }
      : {
          next: `Próximo local: ${suggestedSpot}`,
          last: last ? `Última aplicação ${daysAgoLabel(summary.daysSinceLast)} · ${summary.recentCount} em 30 dias` : null,
          hint: null,
        };
  return (
    <Card testID="injection-card" style={styles.card}>
      <View style={styles.main}>
        {isEstimate && <NextDoseRing next={next} text={text} size={ringSize} isLarge />}
        <View style={styles.copy}>
          <View style={styles.kicker}>
            <Syringe size={16} color={tone.fg} />
            <Text
              ref={headingRef}
              accessibilityRole="header"
              accessibilityLabel={last ? `Medicação injetável: ${title}` : title}
              {...webAttrs({ tabIndex: -1 })}
              style={[styles.kickerText, { color: tone.fg }]}
            >
              {title}
            </Text>
          </View>
          <AppText heading size={fontSize.lg} weight={800} tracking={-0.01} lineHeight={20}>
            {lines.next}
          </AppText>
          {lines.last ? (
            <AppText size={fontSize.sm} color={colors.muted} lineHeight={18}>
              {lines.last}
            </AppText>
          ) : null}
          {lines.hint ? (
            <AppText size={fontSize.sm} color={colors.muted} lineHeight={18} style={styles.hint}>
              {lines.hint}
            </AppText>
          ) : null}
          {last && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Como você está? Registrar bem-estar"
              onPress={onMood}
              style={({ pressed }) => [styles.moodHit, pressed && styles.pressed]}
            >
              <View style={styles.mood}>
                <Smile size={18} color={colors.green700} />
                <AppText size={fontSize.base} weight={700} color={colors.green700} style={styles.shrink}>
                  Como você está?
                </AppText>
              </View>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Calcular dose e registrar · local sugerido: ${suggestedSpot}`}
          onPress={onOpen}
          style={({ pressed }) => [styles.site, pressed && styles.sitePressed]}
        >
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.siteArt}>
            <BodyMapMini site={summary.suggestedSite} side={summary.suggestedSide} />
            <AppText size={fontSize.sm} weight={800} color={colors.green700} align="center" lineHeight={15}>
              {suggestedSpot}
            </AppText>
          </View>
        </Pressable>
      </View>
      {model.isPromoted && (
        <View style={styles.register}>
          <Button label="Registrar aplicação" icon={CircleCheck} onPress={onRegister} />
        </View>
      )}
      {cycle?.top && (
        <View>
          <DashedRule />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isCycleOpen }}
            aria-expanded={isCycleOpen}
            accessibilityLabel={`Seu ciclo da semana · ${cycle.label}`}
            onPress={() => setCycleOpen(!isCycleOpen)}
            style={styles.cycleToggle}
          >
            <AppText size={fontSize.base} weight={600} color={colors.text2} style={styles.grow}>
              {"Seu ciclo da semana · "}
              <AppText size={fontSize.base} weight={800} color={colors.text}>
                {cycle.label}
              </AppText>
            </AppText>
            <View style={isCycleOpen && styles.chevronOpen}>
              <ChevronRight size={18} color={colors.muted} />
            </View>
          </Pressable>
          {isCycleOpen && <CycleTipBlock model={cycle} showHeading={false} onPhases={() => setPhasesOpen(true)} />}
        </View>
      )}
      <CycleSheet model={cycle} visible={isPhasesOpen} onClose={() => setPhasesOpen(false)} />
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12, paddingTop: 18, paddingRight: 14, paddingBottom: 18, paddingLeft: 16, borderRadius: 28 },
  main: { flexDirection: "row", alignItems: "center", gap: 8 },
  copy: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 2 },
  kicker: { flexDirection: "row", alignItems: "center", gap: 6 },
  kickerText: { fontFamily: fontFamily(800), fontSize: fontSize.base, lineHeight: 20 },
  hint: { marginTop: 2 },
  /** "Como você está?": chip menta de 36 px dentro de um alvo de 44. */
  moodHit: { minHeight: 44, maxWidth: "100%", justifyContent: "center", marginTop: 4 },
  mood: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
  },
  /** Em telas estreitas a pílula quebra a frase em vez de passar da coluna. */
  shrink: { flexShrink: 1 },
  pressed: { transform: [{ scale: 0.97 }] },
  /** O mapa é o botão "Calcular dose e registrar": o ponto sugerido em verde e o local embaixo. */
  site: { minWidth: 48, maxWidth: 60, padding: 4, borderRadius: radius.md },
  sitePressed: { backgroundColor: colors.surface3 },
  siteArt: { alignItems: "center", gap: 2 },
  register: { alignItems: "flex-start" },
  /** Os traços que sobram quebram para linhas ocultas (não passam da borda do cartão nem da tela). */
  rule: { flexDirection: "row", flexWrap: "wrap", height: 1, columnGap: 3, overflow: "hidden", marginBottom: 4 },
  dash: { width: 4, height: 1, backgroundColor: colors.border },
  cycleToggle: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 2 },
  grow: { flex: 1, minWidth: 0 },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
}));
