import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from "expo-router/ui";
import { BookOpen, ChartNoAxesCombined, House, Plus, Sparkles, UserRound, X, type LucideIcon } from "lucide-react-native";
import { Children, type ReactNode } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui";
import { QuickLogSheet } from "@/components/quick/quick-log-sheet";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { diagonal, fontSize, gradients, radius, shadows } from "@/theme/tokens";

/** Liquid Glass nativo só no iOS 26+ com a API presente; Android e web ficam com o fundo sólido. */
function hasLiquidGlass(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    // Build sem o módulo nativo (ou beta do iOS 26 sem a API): fica o fundo sólido.
    return false;
  }
}
const HAS_GLASS = hasLiquidGlass();

/** [rota, nome acessível, rótulo curto, ícone]; o botão "+" entra depois do Diário. */
const TABS = [
  ["index", "/", "Hoje", "Hoje", House],
  ["diario", "/diario", "Diário", "Diário", BookOpen],
  ["agente", "/agente", "Meu agente", "Agente", Sparkles],
  ["evolucao", "/evolucao", "Evolução", "Evolução", ChartNoAxesCombined],
  ["espaco", "/espaco", "Meu espaço", "Espaço", UserRound],
] as const;
const FAB_SLOT_INDEX = 2;

/**
 * Barra inferior de ponta a ponta com cinco abas e o botão central de registro (BottomNav do web): fundo da
 * superfície com borda superior fina, aba ativa com a pílula menta atrás do ícone e o "+" subindo sobre a borda.
 */
export function AppTabs() {
  const styles = useStyles();
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <BottomBar>
          {TABS.map(([name, href, label, short, Icon]) => (
            <TabTrigger key={name} name={name} href={href} asChild>
              <TabButton label={label} short={short} icon={Icon} />
            </TabTrigger>
          ))}
        </BottomBar>
      </TabList>
    </Tabs>
  );
}

function BottomBar({ children }: { children?: ReactNode }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isNarrow = width < NARROW_WIDTH;
  const { isQuickOpen, setQuickOpen } = useApp();
  const items = Children.toArray(children);
  const toggle = () => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuickOpen(!isQuickOpen);
  };
  return (
    <>
      <View style={[styles.bar, HAS_GLASS && styles.barGlass, { paddingBottom: BAR_PADDING_BOTTOM + insets.bottom }]} accessibilityRole="tablist">
        {HAS_GLASS && (
          <GlassView
            glassEffectStyle="regular"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.glass}
          />
        )}
        {items.slice(0, FAB_SLOT_INDEX)}
        <View style={styles.fabSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registro rápido"
            accessibilityState={{ expanded: isQuickOpen }}
            onPress={toggle}
            style={({ pressed }) => [styles.fab, isNarrow && styles.fabNarrow, pressed && styles.fabPressed]}
          >
            <LinearGradient colors={gradients.fab} start={diagonal.start} end={diagonal.end} style={styles.fabGradient}>
              {isQuickOpen ? <X size={24} color={colors.white} /> : <Plus size={26} color={colors.white} />}
            </LinearGradient>
          </Pressable>
        </View>
        {items.slice(FAB_SLOT_INDEX)}
      </View>
      <QuickLogSheet visible={isQuickOpen} onClose={() => setQuickOpen(false)} />
    </>
  );
}

type TabButtonProps = TabTriggerSlotProps & { label: string; short: string; icon: LucideIcon };

function TabButton({ label, short, icon: Icon, isFocused, ...rest }: TabButtonProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      {...rest}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      // O react-native-web não traduz accessibilityState: a aba ativa precisa do aria-selected explícito.
      aria-selected={!!isFocused}
      style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
    >
      <View style={[styles.iconPill, isFocused && styles.iconPillActive]} testID={isFocused ? "tab-active-pill" : undefined}>
        <Icon size={22} color={isFocused ? colors.green700 : colors.muted} />
      </View>
      <AppText heading size={fontSize.xs} weight={isFocused ? 800 : 600} color={isFocused ? colors.green700 : colors.muted} lineHeight={16} numberOfLines={1}>
        {short}
      </AppText>
    </Pressable>
  );
}

/** Respiro abaixo das abas, somado à área segura do aparelho. */
const BAR_PADDING_BOTTOM = 8;
/** O "+" (56 px) sobe 26 px a partir do respiro de 8 px (18 px acima da borda superior), como o .nav-fab-slot do web. */
const FAB_SIZE = 56;
/** Abaixo de 360 px o "+" fica com 48 px (como no web). */
const NARROW_WIDTH = 360;
const FAB_SIZE_NARROW = 48;
const FAB_RISE = 26;

const useStyles = makeStyles((colors) => ({
  slot: { flex: 1 },
  /** Barra cheia de ponta a ponta, na cor da superfície, com a borda superior fina (sem pílula flutuante). */
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    boxShadow: shadows.tabBarTop,
  },
  /** No iOS 26+, o vidro nativo faz o fundo da barra (a borda superior continua). */
  barGlass: { backgroundColor: "transparent" },
  glass: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  /** 52 px de altura (alvo real maior que 44), ícone em cima e o rótulo logo abaixo. */
  tab: { flex: 1, minWidth: 0, minHeight: 52, alignItems: "center", justifyContent: "flex-start", gap: 4, paddingHorizontal: 2 },
  /** Pílula menta só atrás do ícone da aba ativa (52 × 30). */
  iconPill: { width: 52, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  iconPillActive: { backgroundColor: colors.mint100 },
  tabPressed: { transform: [{ scale: 0.95 }] },
  fabSlot: { flex: 1, alignItems: "center", marginTop: -FAB_RISE },
  fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, boxShadow: shadows.fab, overflow: "hidden" },
  fabNarrow: { width: FAB_SIZE_NARROW, height: FAB_SIZE_NARROW, borderRadius: FAB_SIZE_NARROW / 2 },
  fabGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  fabPressed: { transform: [{ scale: 0.92 }] },
}));
