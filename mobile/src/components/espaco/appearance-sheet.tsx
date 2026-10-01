import { LinearGradient } from "expo-linear-gradient";
import { Pressable, View } from "react-native";
import { THEME_COPY, THEME_PREFS, type ThemePref } from "@shared/lib/theme";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Sheet } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/** Altura mínima de cada opção (.theme-option do web): o alvo de toque fica bem acima de 44 pt. */
const OPTION_MIN_HEIGHT = 64;
/** Amostra do tema (.theme-swatch). */
const SWATCH_SIZE = 40;
/** Marca de rádio à direita e o miolo quando marcada. */
const RADIO_SIZE = 20;
const RADIO_DOT = 8;

/**
 * "Aparência" (HOJE-X2), espelho do AppearanceSheet do web: Sistema, Claro ou Escuro, só para este
 * aparelho. A escolha vale na hora e o provedor a grava em `webfit-theme`; sem aviso, porque andar
 * pelas opções empilharia três. Só abre com RN_DARK_MODE_ENABLED ligado (veja settings-tab.tsx).
 */
export function AppearanceSheet({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { pref, setPref, colors } = useTheme();
  const choose = (option: ThemePref) => {
    if (option === pref) return;
    selectionHaptic();
    setPref(option);
  };
  return (
    <Sheet visible title={THEME_COPY.title} onClose={onClose}>
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
        {THEME_COPY.hint}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={THEME_COPY.group} style={styles.options}>
        {THEME_PREFS.map((option) => (
          <ThemeOption key={option} option={option} isOn={option === pref} onPress={() => choose(option)} />
        ))}
      </View>
    </Sheet>
  );
}

/** Uma opção: amostra, nome e explicação, marca de rádio à direita (a opção inteira é o alvo). */
function ThemeOption({ option, isOn, onPress }: { option: ThemePref; isOn: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={THEME_COPY.options[option]}
      accessibilityHint={THEME_COPY.details[option]}
      accessibilityState={{ checked: isOn }}
      {...webAttrs({ "aria-checked": isOn })}
      onPress={onPress}
      testID={`theme-option-${option}`}
      style={({ pressed }) => [styles.option, isOn && styles.optionOn, pressed && styles.pressed]}
    >
      <Swatch option={option} />
      <View style={styles.text}>
        <AppText heading size={fontSize.md} weight={800} lineHeight={19} color={isOn ? colors.text : colors.text2}>
          {THEME_COPY.options[option]}
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={16}>
          {THEME_COPY.details[option]}
        </AppText>
      </View>
      <View style={[styles.radio, isOn && styles.radioOn]}>{isOn ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

/** Amostra: papel claro, azul-marinho ou os dois na diagonal (Sistema), com a faixa verde embaixo. */
function Swatch({ option }: { option: ThemePref }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View
      style={[styles.swatch, option === "claro" && styles.swatchLight, option === "escuro" && styles.swatchDark]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {option === "sistema" ? (
        <LinearGradient
          colors={[colors.artPaper, colors.artPaper, colors.navy, colors.navy]}
          locations={[0, 0.5, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        />
      ) : null}
      <View style={styles.swatchBar} />
    </View>
  );
}

// Espelha .theme-option / .theme-swatch de src/components/espaco/Appearance.css.
const useStyles = makeStyles((colors, scheme) => ({
  options: { gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: OPTION_MIN_HEIGHT,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  optionOn: {
    borderColor: themeDomainTone(scheme).food.fg,
    backgroundColor: themeDomainTone(scheme).food.bg,
    boxShadow: "inset 0px 0px 0px 1px " + themeDomainTone(scheme).food.fg,
  },
  pressed: { transform: [{ scale: 0.99 }] },
  text: { flex: 1, minWidth: 0, gap: 2 },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.artLine,
  },
  swatchLight: { backgroundColor: colors.artPaper },
  swatchDark: { borderColor: colors.navySoft, backgroundColor: colors.navy },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  swatchBar: {
    position: "absolute",
    left: 7,
    right: 7,
    bottom: 8,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.emerald,
  },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIO_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.slate300,
    backgroundColor: colors.surface,
  },
  radioOn: { borderColor: themeDomainTone(scheme).food.fg },
  radioDot: {
    width: RADIO_DOT,
    height: RADIO_DOT,
    borderRadius: RADIO_DOT / 2,
    backgroundColor: themeDomainTone(scheme).food.fg,
  },
}));
