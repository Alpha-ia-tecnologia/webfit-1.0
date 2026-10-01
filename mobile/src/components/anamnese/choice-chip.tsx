import { Check, ChevronDown, Plus, type LucideIcon } from "lucide-react-native";
import { useId, type Ref } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { spaceKey } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows } from "@/theme/tokens";
import { useQuestionScale } from "./q-block";

// Até esta largura o web (.choice-grid) usa uma coluna só.
const NARROW_MAX_WIDTH = 480;

/** Coluna única em telas estreitas, como o .choice-grid do web. */
export function useIsNarrowGrid() {
  return useWindowDimensions().width <= NARROW_MAX_WIDTH;
}

/**
 * aria-pressed e aria-haspopup não estão nos tipos do React Native, mas o react-native-web os
 * repassa ao DOM (no aparelho são ignorados): o mesmo estado de alternância dos botões do web.
 */
export const webAria = (props: { "aria-pressed"?: boolean; "aria-haspopup"?: "dialog" }): object => props;

type Props = {
  /** Texto visível (o curto, quando houver). */
  text: string;
  /** Nome acessível quando difere do texto visível (começa por ele: rótulo no nome). */
  name?: string;
  hint?: string;
  /** Decorativo, antes do texto (comida, alergias e atividade física); fora do nome acessível. */
  emoji?: string;
  /** Ícone da opção (condições, excludentes); marcada, a pílula troca o ícone pelo ✓. */
  icon?: LucideIcon;
  isOn: boolean;
  /** "Prefiro não informar", "Nenhuma"...: selecionado em cinza, não em verde. */
  isNone?: boolean;
  /** Excludentes lado a lado no topo: crescem e centralizam o texto. */
  isExclusive?: boolean;
  /** "Outros": borda tracejada e sinal de mais. */
  isOther?: boolean;
  /** Pílula compacta (listas sem descrição) em vez de cartão. */
  isPill?: boolean;
  /** Múltipla escolha: marca quadrada; escolha única: redonda. */
  isMulti?: boolean;
  isNarrow: boolean;
  /** radio: escolha única (cartões de enum); button: chips de uma ou mais opções. */
  role?: "button" | "radio";
  /** Etiqueta curta ao lado do texto (ex.: "Sugerido"); `spoken` completa o nome acessível. */
  tag?: { text: string; spoken: string };
  onPress: () => void;
  /** Permite levar o foco à pílula (ex.: primeira opção revelada por "Mostrar outras opções"). */
  ref?: Ref<View>;
};

/**
 * Escolha (.choice-chip) em dois formatos: cartão com indicador à esquerda e dica opcional (listas
 * com descrição) ou pílula compacta de 44 px com ícone (conceito 07), que troca o ícone pelo ✓ num
 * círculo claro quando escolhida. Na página da anamnese (escala diferente de "base") ganha o visual do
 * conceito: sombra leve, 12 px de respiro e "Outra" tracejada sobre o fundo.
 */
export function ChoiceChip({
  text,
  name,
  hint,
  emoji,
  icon: Icon,
  isOn,
  isNone = false,
  isExclusive = false,
  isOther = false,
  isPill = false,
  isMulti = false,
  isNarrow,
  role = "button",
  tag,
  onPress,
  ref,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isRadio = role === "radio";
  const isPage = useQuestionScale() !== "base";
  const showIcon = isPill && !!Icon && !isOn;
  // Pílula sem marca quando não escolhida (exceto "Outros", que mostra o sinal de mais).
  const showCheck = !showIcon && (!isPill || isOn || isOther);
  const textColor = isPill
    ? isOn
      ? isOther
        ? colors.green800
        : isNone
          ? colors.surface
          : colors.white
      : isOther && isPage
        ? colors.muted
        : colors.text2
    : isOn
      ? colors.text
      : colors.text2;
  const label = name ?? text;
  // A dica também descreve a opção no export web (o accessibilityHint só existe no aparelho).
  const hintId = `choice-hint-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <Pressable
      ref={ref}
      accessibilityRole={role}
      accessibilityLabel={tag ? `${label}, ${tag.spoken}` : label}
      accessibilityHint={hint}
      {...(hint ? { "aria-describedby": hintId } : null)}
      accessibilityState={isRadio ? { checked: isOn } : { selected: isOn }}
      aria-checked={isRadio ? isOn : undefined}
      {...(isRadio ? spaceKey(onPress) : webAria({ "aria-pressed": isOn }))}
      onPress={onPress}
      style={({ pressed }) => [
        ...(isPill ? pillStyles(styles, isOn, isNone, isOther, isPage) : cardStyles(styles, isOn, isNone, isOther, isNarrow, isPage)),
        isExclusive && styles.exclusive,
        pressed && styles.pressed,
      ]}
    >
      {showIcon && Icon ? <Icon size={17} color={colors.text2} /> : null}
      {showCheck ? (
        <View style={[...checkStyles(styles, isPill, isOn, isNone, isOther, isPage), isMulti && !isOther && !isPill && styles.checkSquare]}>
          {isOther ? (
            <Plus size={isPill ? 16 : 12} color={isOn ? colors.white : colors.muted} strokeWidth={isPill ? 2.25 : 3} />
          ) : isOn ? (
            <Check size={12} color={isPill && isNone ? colors.surface : colors.white} strokeWidth={3} />
          ) : null}
        </View>
      ) : null}
      {emoji ? (
        <AppText
          size={fontSize.md}
          lineHeight={18}
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {emoji}
        </AppText>
      ) : null}
      <View style={isPill ? styles.pillText : styles.text}>
        <AppText size={isPill ? fontSize.base : fontSize.sm} weight={600} lineHeight={isPill ? 18 : 17} color={textColor}>
          {text}
        </AppText>
        {tag ? (
          <View style={styles.tag}>
            <AppText size={fontSize.xs} weight={700} lineHeight={15} color={colors.green800}>
              {tag.text}
            </AppText>
          </View>
        ) : null}
        {hint ? (
          <AppText nativeID={hintId} size={fontSize.xs} color={colors.muted} lineHeight={16} style={styles.hint}>
            {hint}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** "Ver mais N": abre a folha com todas as opções e a busca. */
export function MorePill({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...webAria({ "aria-haspopup": "dialog" })}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, styles.more, pressed && styles.pressed]}
    >
      <AppText size={fontSize.base} weight={600} lineHeight={18} color={colors.text}>
        {label}
      </AppText>
      <ChevronDown size={18} color={colors.text} />
    </Pressable>
  );
}

type Styles = ReturnType<typeof useStyles>;

function cardStyles(styles: Styles, isOn: boolean, isNone: boolean, isOther: boolean, isNarrow: boolean, isPage: boolean) {
  return [
    styles.chip,
    isNarrow && styles.chipNarrow,
    isPage && styles.chipPage,
    isOther && styles.chipOther,
    isOn && (isNone ? styles.chipNoneOn : isPage ? styles.chipOnPage : styles.chipOn),
  ];
}

function pillStyles(styles: Styles, isOn: boolean, isNone: boolean, isOther: boolean, isPage: boolean) {
  return [
    styles.pill,
    isPage && styles.pillPage,
    isPage && !isOn && !isOther && styles.pillRaised,
    isOther && (isPage ? styles.pillOtherPage : styles.pillOther),
    isOn && (isOther ? styles.pillOtherOn : isNone ? styles.pillNoneOn : styles.pillOn),
  ];
}

function checkStyles(styles: Styles, isPill: boolean, isOn: boolean, isNone: boolean, isOther: boolean, isPage: boolean) {
  if (!isPill) return [styles.check, isOn && (isNone ? styles.checkNoneOn : styles.checkOn)];
  return [styles.pillCheck, isPage && styles.pillCheckPage, isOn && (isOther ? styles.pillCheckOtherOn : styles.pillCheckOn)];
}

/** Grade das escolhas (.choice-grid), compartilhada pelas listas de opções. */
export function useChoiceGrid() {
  return useGridStyles().grid;
}

// Espelha .choice-grid / .choice-pill-row / .choice-chip / .choice-check de AnamneseInputs.css (≤ 800 px).
const useGridStyles = makeStyles(() => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));

const useStyles = makeStyles((colors) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: "47%",
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipNarrow: { minWidth: "100%", flexBasis: "100%", minHeight: 48 },
  // Página da anamnese: cartão sobre o fundo, com fio suave e sombra leve (conceito 07).
  chipPage: {
    minHeight: 60,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderColor: "transparent",
    boxShadow: `inset 0px 0px 0px 1px ${colors.borderSoft}, ${shadows.card}`,
  },
  chipOther: { borderStyle: "dashed", borderColor: colors.border },
  chipOn: { borderColor: colors.green500, backgroundColor: colors.chipOnWash, boxShadow: "inset 0px 0px 0px 1px " + colors.green500 + ", " + shadows.choiceOn },
  // Marcado na página: anel verde de 2 px e halo menta.
  chipOnPage: { backgroundColor: colors.chipOnWash, boxShadow: `inset 0px 0px 0px 2px ${colors.green500}, 0px 0px 0px 4px ${colors.mint50}` },
  chipNoneOn: { borderColor: colors.muted, backgroundColor: colors.surface2, boxShadow: "inset 0px 0px 0px 1px " + colors.muted },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // Pílula na página da anamnese: 12 px de respiro, ícone de 17 px e sombra leve.
  pillPage: { gap: 6, paddingHorizontal: 12 },
  pillRaised: { boxShadow: shadows.card },
  // Marcada: pílula verde escura com texto branco (5,5:1).
  pillOn: { borderColor: colors.accentFill, backgroundColor: colors.accentFill, boxShadow: shadows.pillOn },
  // Excludentes ("Nenhuma", "Prefiro não informar"): neutras, também quando marcadas.
  pillNoneOn: { borderColor: colors.text2, backgroundColor: colors.text2 },
  pillOther: { borderStyle: "dashed" },
  // "Outra" na página: tracejado sobre o fundo, sem superfície.
  pillOtherPage: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.slate300, backgroundColor: "transparent" },
  pillOtherOn: { borderColor: colors.green500, backgroundColor: colors.mint50 },
  exclusive: { flexGrow: 1, flexBasis: "auto", justifyContent: "center" },
  more: { paddingLeft: 16, paddingRight: 12, borderColor: "transparent", backgroundColor: colors.surface2 },
  pressed: { transform: [{ scale: 0.98 }] },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.slate300, alignItems: "center", justifyContent: "center" },
  checkOn: { borderColor: colors.green500, backgroundColor: colors.green500 },
  checkNoneOn: { borderColor: colors.muted, backgroundColor: colors.muted },
  pillCheck: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  pillCheckPage: { width: 20, height: 20, borderRadius: 10 },
  // Fundo translúcido da marca dentro da pílula verde.
  pillCheckOn: { backgroundColor: colors.onFillOverlayStrong },
  pillCheckOtherOn: { backgroundColor: colors.green600 },
  checkSquare: { borderRadius: 6 },
  text: { flex: 1, minWidth: 0 },
  pillText: { flexShrink: 1, minWidth: 0 },
  hint: { marginTop: 2 },
  // .choice-tag: "Sugerido" em pílula verde-clara (sugestão, nunca marcação automática).
  tag: { alignSelf: "flex-start", marginTop: 4, paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.mint100 },
}));
