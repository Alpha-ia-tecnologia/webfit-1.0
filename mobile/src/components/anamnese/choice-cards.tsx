import { Check } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { SELECT_FACES, SELECT_HINTS, SELECT_ICONS, SELECT_LAYOUT } from "@shared/data/anamneseOptions";
import type { Question } from "@shared/data/questionnaire";
import { spaceKey } from "@/components/refeicao/web-a11y";
import { AppText, RadioCard } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { ChoiceChip, useChoiceGrid, useIsNarrowGrid } from "./choice-chip";
import { CHOICE_ICON, FACE_ICON } from "./icons";
import { QBlock, QHelpLine } from "./q-block";
import type { AboutSlot } from "./stage-about";

/** Etiqueta da sugestão de nível de atividade (só uma etiqueta; nunca marca sozinha). */
const SUGGESTED_TAG = { text: "Sugerido", spoken: "sugerido pelos seus dias de treino" };
/** Altura mínima dos cartões com rosto (sono e estresse). */
const FACE_MIN_HEIGHT = 72;

type Props = {
  field: Question;
  value: string;
  error?: string;
  /** Opção sugerida (ex.: nível de atividade pelos dias de treino): ganha a etiqueta "Sugerido". */
  suggested?: string | null;
  /** Leva o foco à opção marcada ao aparecer (ex.: "Alterar objetivo"). */
  focusChecked?: boolean;
  /** "ⓘ Por quê?" da etapa (só na 1ª pergunta). */
  about?: AboutSlot;
  onChange: (value: string) => void;
};

/**
 * Perguntas de escolha única (enums) em cartões de rádio, com o mesmo visual dos chips (ChoiceCards do
 * web). Título com a pergunta e, embaixo, a dica ou "Escolha uma"; sono e estresse ganham rostos
 * neutros; Sim/Não da caneta viram 2 blocos grandes lado a lado e "Prefiro não informar" em texto.
 */
export function ChoiceCards({ field, value, error, suggested, focusChecked, about, onChange }: Props) {
  const styles = useStyles();
  const hints = SELECT_HINTS[field.key] ?? {};
  const faces = SELECT_FACES[field.key];
  const icons = SELECT_ICONS[field.key] ?? {};
  const isBinary = SELECT_LAYOUT[field.key] === "binary";
  // Sem descrições nas opções, as respostas curtas (Sim/Não, Boa/Regular) viram pílulas.
  const isPills = Object.keys(hints).length === 0;
  const isNarrow = useIsNarrowGrid();
  const choiceGrid = useChoiceGrid();
  const checked = useRef<View>(null);
  useEffect(() => {
    if (focusChecked) focusNode(checked.current);
    // Só ao aparecer: depois o foco fica onde a pessoa o levar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const options = field.options ?? [];
  const faced = faces ? options.filter(([option]) => faces[option]) : [];
  const rest = faces ? options.filter(([option]) => !faces[option]) : options;
  return (
    <QBlock
      label={field.label}
      prompt={field.prompt}
      optional={field.optional}
      error={error}
      help={<QHelpLine text={field.hint ?? "Escolha uma"} about={about?.button} />}
      panel={about?.panel}
      hasHeadMargin={false}
    >
      {isBinary ? (
        <BinaryChoice field={field} value={value} hints={hints} icons={icons} isInvalid={!!error} onChange={onChange} />
      ) : (
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={field.label}>
          {faced.length ? (
            <View style={styles.faces}>
              {faced.map(([option, label]) => (
                <FaceCard
                  key={option}
                  ref={value === option ? checked : undefined}
                  label={label}
                  face={faces![option]!}
                  isOn={value === option}
                  onPress={() => onChange(option)}
                />
              ))}
            </View>
          ) : null}
          <View style={choiceGrid}>
            {rest.map(([option, label]) => (
              <ChoiceChip
                key={option}
                ref={value === option ? checked : undefined}
                role="radio"
                text={label}
                hint={hints[option]}
                tag={suggested === option ? SUGGESTED_TAG : undefined}
                isOn={value === option}
                isPill={isPills || !!faces}
                isNarrow={isNarrow}
                onPress={() => onChange(option)}
              />
            ))}
          </View>
        </View>
      )}
    </QBlock>
  );
}

type BinaryProps = {
  field: Question;
  value: string;
  hints: Record<string, string>;
  icons: NonNullable<(typeof SELECT_ICONS)[string]>;
  isInvalid: boolean;
  onChange: (value: string) => void;
};

/**
 * Sim/Não em blocos grandes lado a lado (.choice-binary): ícone no alto, marca no canto e a dica do
 * "Sim" ("Depois: caneta e dose"). As outras respostas ("Prefiro não informar") viram rádio em texto,
 * centralizado sob os blocos. Nunca sugere dose.
 */
function BinaryChoice({ field, value, hints, icons, isInvalid, onChange }: BinaryProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const options = field.options ?? [];
  // Blocos na ordem dos ícones (Sim, Não); o resto vira rádio em texto.
  const tiles = Object.keys(icons)
    .map((key) => options.find(([option]) => option === key))
    .filter((entry): entry is [string, string] => !!entry);
  const rest = options.filter(([option]) => !icons[option]);
  return (
    <View style={styles.binary} accessibilityRole="radiogroup" accessibilityLabel={field.label}>
      <View style={styles.tiles}>
        {tiles.map(([option, label]) => {
          const Icon = CHOICE_ICON[icons[option]!];
          const isOn = value === option;
          const isSim = option === "sim";
          return (
            <RadioCard
              key={option}
              name={`${field.key}Choice`}
              value={option}
              checked={isOn}
              onChange={onChange}
              layout="tile"
              indicator="check"
              // A dica do bloco ("Depois: caneta e dose") também é lida, como o texto do rótulo no web.
              accessibilityLabel={hints[option] ? `${label}, ${hints[option]}` : label}
              isInvalid={isInvalid}
              media={
                <View style={[styles.media, isSim && styles.mediaSim]}>
                  <Icon size={24} color={isSim ? colors.green700 : colors.text2} />
                </View>
              }
              title={
                <AppText heading size={fontSize["2xl"]} weight={800} lineHeight={30} color={isOn ? colors.green800 : colors.text}>
                  {label}
                </AppText>
              }
              subtitle={
                hints[option] ? (
                  <AppText size={fontSize.sm} weight={700} lineHeight={18} color={colors.green700}>
                    {hints[option]}
                  </AppText>
                ) : undefined
              }
            />
          );
        })}
      </View>
      {rest.map(([option, label]) => {
        const isOn = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: isOn }}
            aria-checked={isOn}
            {...spaceKey(() => onChange(option))}
            onPress={() => onChange(option)}
            style={({ pressed }) => [styles.textRadio, isOn && styles.textRadioOn, pressed && styles.pressed]}
          >
            {isOn ? <Check size={16} strokeWidth={3} color={colors.green700} /> : null}
            <AppText size={fontSize.base} weight={isOn ? 700 : 600} color={isOn ? colors.green700 : colors.muted}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

type FaceProps = {
  label: string;
  face: "smile" | "meh" | "frown";
  isOn: boolean;
  onPress: () => void;
  ref?: React.Ref<View>;
};

/** Cartão com rosto neutro acima do texto (.choice-faces): nunca vermelho ou âmbar. */
function FaceCard({ label, face, isOn, onPress, ref }: FaceProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const Icon = FACE_ICON[face];
  return (
    <Pressable
      ref={ref}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: isOn }}
      aria-checked={isOn}
      {...spaceKey(onPress)}
      onPress={onPress}
      style={({ pressed }) => [styles.face, isOn && styles.faceOn, pressed && styles.pressed]}
    >
      <Icon size={24} color={isOn ? colors.green700 : colors.text2} />
      <AppText size={fontSize.sm} weight={600} lineHeight={17} color={isOn ? colors.text : colors.text2} align="center">
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { gap: 8 },
  faces: { flexDirection: "row", gap: 8 },
  face: { flex: 1, minHeight: FACE_MIN_HEIGHT, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  faceOn: { borderColor: colors.green500, backgroundColor: colors.mint50, boxShadow: "inset 0px 0px 0px 1px " + colors.green500 },
  pressed: { transform: [{ scale: 0.98 }] },
  // .choice-binary: blocos em 2 colunas iguais e o rádio em texto centralizado embaixo.
  binary: { alignItems: "center", gap: 10 },
  tiles: { flexDirection: "row", gap: 12, alignSelf: "stretch" },
  media: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  mediaSim: { backgroundColor: colors.mint100 },
  textRadio: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999 },
  textRadioOn: { backgroundColor: colors.mint50 },
}));
