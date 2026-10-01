import { ChevronLeft, ChevronRight, FlaskConical, Lock, RefreshCw, Stethoscope, Syringe, type LucideIcon } from "lucide-react-native";
import { useRef, useState } from "react";
import { ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { AppText, Button, Sheet } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

const CARDS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: FlaskConical,
    title: "Confira o frasco",
    text: "A conversão usa a concentração do rótulo, em mg/ml: concentração errada resulta em dose errada. Frasco novo? Confira antes de aspirar.",
  },
  {
    icon: Syringe,
    title: "Leia a seringa certa",
    text: "Na seringa de insulina, 100 UI equivalem a 1 ml. Leia na borda do êmbolo.",
  },
  {
    icon: RefreshCw,
    title: "Troque o local",
    text: "Alterne abdômen, coxa e braço e troque de lado a cada aplicação. Use agulha ou seringa nova e evite áreas com hematoma, dor ou irritação.",
  },
  {
    icon: Stethoscope,
    title: "Quem orienta a dose",
    text: "O app e o agente não indicam nem ajustam doses. Náusea intensa, vômitos persistentes, dor abdominal forte ou reação no local da aplicação: procure quem prescreveu ou atendimento presencial.",
  },
];

/** "Guia rápido": quatro cartões de segurança deslizáveis, com anterior/próximo e a posição anunciada. */
export function GuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const go = (next: number) => {
    const target = Math.min(CARDS.length - 1, Math.max(0, next));
    setIndex(target);
    scroller.current?.scrollTo({ x: target * width, animated: true });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const at = Math.round(event.nativeEvent.contentOffset.x / width);
    if (at !== index && at >= 0 && at < CARDS.length) setIndex(at);
  };
  return (
    <Sheet
      visible={visible}
      title="Guia rápido"
      onClose={() => {
        setIndex(0);
        onClose();
      }}
    >
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        role="list"
      >
        {width > 0 &&
          CARDS.map(({ icon: Icon, title, text }) => (
            <View key={title} role="listitem" style={[styles.page, { width }]}>
              <View style={styles.card}>
                <View style={styles.tile}>
                  <Icon size={22} color={tone.fg} />
                </View>
                <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header">
                  {title}
                </AppText>
                <AppText size={fontSize.base} color={colors.text2} lineHeight={21}>
                  {text}
                </AppText>
              </View>
            </View>
          ))}
      </ScrollView>
      <View style={styles.nav}>
        <Button label="Cartão anterior" icon={ChevronLeft} variant="secondary" size="sm" disabled={index === 0} onPress={() => go(index - 1)} style={styles.navButton} />
        <AppText size={fontSize.sm} weight={700} color={colors.text2} aria-live="polite" accessibilityLiveRegion="polite">
          {index + 1} de {CARDS.length}
        </AppText>
        <Button label="Próximo cartão" iconRight={ChevronRight} variant="secondary" size="sm" disabled={index === CARDS.length - 1} onPress={() => go(index + 1)} style={styles.navButton} />
      </View>
      <View style={styles.footer}>
        <Lock size={12} color={colors.muted} />
        <AppText size={fontSize.xs} color={colors.muted}>
          O registro fica no diário, neste aparelho.
        </AppText>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  page: { paddingHorizontal: 2 },
  card: {
    gap: 10,
    padding: 16,
    minHeight: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).medication.border,
    backgroundColor: themeDomainTone(scheme).medication.bg,
  },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  navButton: { minHeight: 44 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
}));
