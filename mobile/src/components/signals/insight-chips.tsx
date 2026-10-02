import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { signalChip, type InsightChip, type InsightSheetAction, type InsightSheetModel, type InsightTone } from "@shared/lib/day";
import { localDate } from "@shared/lib/domain";
import { activeSignals, dismissSignal, type SignalScreen } from "@shared/lib/signals";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, EnterView } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type ThemeColors } from "@/theme/tokens";
import { INSIGHT_DOMAIN, INSIGHT_ICONS, InsightSheet } from "./insight-sheet";

/** Altura do chip (web: 32 px) e cascata de 40 ms por chip (a entrada de 240 ms + 8 px é a do EnterView). */
const CHIP_HEIGHT = 32;
const STAGGER_MS = 40;

/** Texto AA sobre o fundo do tom (como pillColors do Pill): água em azul 700, combinado em teal 700, menta em verde 700. */
function chipText(tone: InsightTone, colors: ThemeColors): string {
  if (tone === "info") return colors.sky700;
  if (tone === "positive") return colors.teal700;
  if (tone === "neutral") return colors.text2;
  return colors.green700;
}

type Props = {
  /** Só os chips com folha aparecem; os de contexto (água, combinado, despensa) ficam no Resumo. */
  chips: InsightChip[];
  /** Nome acessível do grupo. */
  label?: string;
  onAction: (action: InsightSheetAction) => void;
  onDismiss: (key: string) => void;
};

/**
 * Linha horizontal de chips de insight (InsightChips do web): ícone 16 px + título curto, 32 px, raio
 * total, fundo e texto do tom. O toque abre a InsightSheet com a frase, a ação e "Dispensar".
 * Entrada em cascata (fade + 8 px), desligada com "reduzir movimento".
 */
export function InsightChips({ chips, label = "Observado nos seus registros", onAction, onDismiss }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const isReduced = useReducedMotion();
  const domainTone = themeDomainTone(scheme);
  const [open, setOpen] = useState<InsightSheetModel | null>(null);
  const items = chips.filter((chip) => chip.sheet);
  if (items.length === 0) return null;
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroller}
        accessibilityRole="list"
        accessibilityLabel={label}
        testID="insight-chips"
      >
        {items.map((chip, index) => {
          const sheet = chip.sheet!;
          const Icon = INSIGHT_ICONS[sheet.tone];
          const tone = domainTone[INSIGHT_DOMAIN[sheet.tone]];
          const fg = chipText(sheet.tone, colors);
          return (
            <EnterView key={sheet.id} isReduced={isReduced} delay={index * STAGGER_MS}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={chip.full}
                {...webAttrs({ "aria-haspopup": "dialog" })}
                onPress={() => setOpen(sheet)}
                testID={`insight-chip-${sheet.id}`}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: tone.bg, borderColor: tone.border },
                  pressed && styles.pressed,
                ]}
              >
                <Icon size={16} color={fg} />
                <AppText size={fontSize.sm} weight={700} color={fg} numberOfLines={1}>
                  {chip.text}
                </AppText>
              </Pressable>
            </EnterView>
          );
        })}
      </ScrollView>
      <InsightSheet
        sheet={open}
        onAction={(action) => {
          setOpen(null);
          onAction(action);
        }}
        onDismiss={(key) => {
          setOpen(null);
          onDismiss(key);
        }}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/**
 * Os sinais ativos da tela (signals.ts) como chips, logo abaixo do cabeçalho: a ação abre Meu agente
 * com a pergunta pronta; dispensar pausa o sinal por 3 dias; perfis calmos nunca veem nada.
 */
export function ScreenInsightChips({ screen }: { screen: SignalScreen }) {
  const { state, commit, askAgent } = useApp();
  const router = useRouter();
  const today = localDate();
  const chips = activeSignals(state, today, screen).map(signalChip);
  if (chips.length === 0) return null;
  return (
    <InsightChips
      chips={chips}
      onAction={(action) => {
        if (action.kind === "agent") askAgent(action.prompt);
        else if (action.kind === "chat") router.push("/agente");
      }}
      onDismiss={(key) => void commit((s) => dismissSignal(s, key, today))}
    />
  );
}

const useStyles = makeStyles(() => ({
  /* Sem flex: a linha tem a altura dos chips e não disputa espaço com a tela. */
  scroller: { flexGrow: 0, marginHorizontal: -16 },
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: CHIP_HEIGHT,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pressed: { transform: [{ scale: 0.97 }] },
}));
