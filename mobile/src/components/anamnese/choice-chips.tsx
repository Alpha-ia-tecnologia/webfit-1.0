import { useEffect, useRef, useState, type Ref } from "react";
import { View } from "react-native";
import {
  choiceLayout,
  choiceName,
  choiceSections,
  choiceText,
  composeChoices,
  filterChoices,
  parseChoices,
  splitChoices,
  toggleChoice,
  type ChoiceConfig,
  type ChoiceOption,
} from "@shared/components/anamnese/inputs";
import { AppText, Button, TextField } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { ChoiceChip, MorePill, useChoiceGrid, useIsNarrowGrid } from "./choice-chip";
import { ChoiceSheet } from "./choice-sheet";
import { CHOICE_ICON } from "./icons";
import { QBlock, QHelpLine } from "./q-block";
import type { AboutSlot } from "./stage-about";

type Props = {
  label: string;
  /** Pergunta exibida no lugar do rótulo ("Tem algum diagnóstico de saúde?"). */
  prompt?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value: string;
  config: ChoiceConfig;
  /** "ⓘ Por quê?" da etapa (só na 1ª pergunta). */
  about?: AboutSlot;
  onChange: (value: string) => void;
};

/**
 * Escolhas (única ou múltipla) com "Outros" (ChoiceChips do web, conceito 07). Listas sem descrição
 * viram pílulas com ícone: excludentes ("Nenhuma", "Prefiro não informar") lado a lado no topo e,
 * quando marcadas, recolhem as demais; as 8 primeiras opções ficam à vista e o resto abre em
 * "Ver mais N", com busca. O valor gravado continua sendo texto: opções separadas por vírgula mais o
 * texto livre.
 */
export function ChoiceChips({ label, prompt, hint, error, optional, value, config, about, onChange }: Props) {
  const styles = useStyles();
  const parsed = parseChoices(value, config);
  const isNarrow = useIsNarrowGrid();
  const choiceGrid = useChoiceGrid();
  // Lista fechada (hideOther): sem "Outros"; texto fora da lista não abre campo livre.
  const hasOther = !config.hideOther;
  const [isOtherRequested, setOtherOpen] = useState(parsed.other !== "");
  const isOtherOpen = hasOther && isOtherRequested;
  const [isExpanded, setExpanded] = useState(false);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  // "Mostrar outras opções" some ao ser tocado: o foco segue para a primeira opção revelada.
  const firstCommon = useRef<View>(null);
  const focusCommon = useRef(false);
  // O campo mostra o texto como digitado (o espaço no fim incluído); o valor gravado é o aparado. Só volta ao
  // gravado quando ele muda por fora (outra opção marcada, texto reconhecido como opção).
  const [otherText, setOtherText] = useState(parsed.other);
  useEffect(() => {
    if (parsed.other) setOtherOpen(true);
    setOtherText((text) => (text.trim() === parsed.other ? text : parsed.other));
  }, [parsed.other]);
  useEffect(() => {
    if (!isExpanded || !focusCommon.current) return;
    focusCommon.current = false;
    focusNode(firstCommon.current);
  }, [isExpanded]);
  const isPills = choiceLayout(config) === "pills";
  const isMulti = config.mode === "multi";
  const otherLabel = config.otherLabel ?? "Outros";
  const pick = (option: ChoiceOption) => {
    const next = toggleChoice(parsed.selected, option, config);
    const other = config.mode === "single" || !hasOther ? "" : parsed.other;
    if (config.mode === "single") setOtherOpen(false);
    if (option.none && !parsed.selected.includes(option.value)) setExpanded(false);
    onChange(composeChoices(next, other, config));
  };
  const writeOther = (text: string) => {
    setOtherText(text);
    onChange(composeChoices(config.mode === "single" ? [] : parsed.selected, text, config));
  };
  const toggleOther = () => {
    if (isOtherOpen) {
      writeOther("");
      setOtherOpen(false);
    } else setOtherOpen(true);
  };
  const chip = (option: ChoiceOption, ref?: Ref<View>, isExclusive = false) => (
    <ChoiceChip
      key={option.value}
      ref={ref}
      text={choiceText(option)}
      name={choiceName(option)}
      hint={option.hint}
      emoji={option.emoji}
      icon={option.icon ? CHOICE_ICON[option.icon] : undefined}
      isOn={parsed.selected.includes(option.value)}
      isNone={option.none}
      isExclusive={isExclusive}
      isPill={isPills}
      isMulti={isMulti}
      isNarrow={isNarrow}
      onPress={() => pick(option)}
    />
  );
  const otherChip = hasOther && (
    <ChoiceChip text={otherLabel} isOn={isOtherOpen} isOther isPill={isPills} isNarrow={isNarrow} onPress={toggleOther} />
  );
  const { exclusive, visible, hidden } = splitChoices(config, parsed.selected);
  const common = [...visible, ...hidden];
  const isExclusiveOn = exclusive.some((option) => parsed.selected.includes(option.value));
  // Respostas antigas ("Nenhuma, Hipertensão") nunca escondem uma opção comum marcada.
  const hasCommonOn = common.some((option) => parsed.selected.includes(option.value));
  const showCommon = !isExclusiveOn || isExpanded || hasCommonOn;
  const results = filterChoices(common, query);
  const pills = (
    <View style={styles.pills}>
      {exclusive.length > 0 && <View style={styles.exclusiveRow}>{exclusive.map((option) => chip(option, undefined, true))}</View>}
      {exclusive.length > 0 && showCommon && <Divider />}
      {showCommon && config.sections ? (
        <View style={styles.sections}>
          {choiceSections(config, visible).map((section, index) => (
            <View
              key={section.title ?? "rest"}
              style={styles.section}
              role={section.title ? "group" : undefined}
              aria-label={section.title ?? undefined}
            >
              {section.title ? <SectionTitle text={section.title} /> : null}
              <View style={choiceGrid}>
                {section.options.map((option, optionIndex) =>
                  chip(option, index === 0 && optionIndex === 0 ? firstCommon : undefined),
                )}
              </View>
            </View>
          ))}
          {otherChip ? <View style={choiceGrid}>{otherChip}</View> : null}
        </View>
      ) : showCommon ? (
        <View style={choiceGrid}>
          {visible.map((option, index) => chip(option, index === 0 ? firstCommon : undefined))}
          {hidden.length > 0 && (
            <MorePill
              label={`Ver mais ${hidden.length}`}
              onPress={() => {
                setQuery("");
                setSheetOpen(true);
              }}
            />
          )}
          {otherChip}
        </View>
      ) : (
        <Button
          label="Mostrar outras opções"
          variant="text"
          style={styles.expand}
          onPress={() => {
            focusCommon.current = true;
            setExpanded(true);
          }}
        />
      )}
    </View>
  );
  return (
    <QBlock
      label={label}
      prompt={prompt}
      optional={optional}
      hint={hint}
      error={error}
      help={<QHelpLine text={isMulti ? "Marque todos que se aplicam" : "Escolha uma"} about={about?.button} />}
      panel={about?.panel}
    >
      {isPills ? (
        pills
      ) : (
        <View style={choiceGrid}>
          {config.options.map((option) => chip(option))}
          {otherChip}
        </View>
      )}
      {isOtherOpen && (
        <TextField
          maxLength={500}
          placeholder={config.otherPlaceholder ?? "Descreva com suas palavras"}
          accessibilityLabel={`${label}: outros`}
          value={otherText}
          onChangeText={writeOther}
        />
      )}
      {/* Continua montada mesmo quando a última opção escondida é marcada com a folha aberta. */}
      {isPills ? (
        <ChoiceSheet
          visible={isSheetOpen}
          label={label}
          otherLabel={otherLabel}
          query={query}
          onQuery={setQuery}
          isEmpty={results.length === 0}
          onClose={() => setSheetOpen(false)}
        >
          {results.map((option) => chip(option))}
        </ChoiceSheet>
      ) : null}
    </QBlock>
  );
}

/** Título de um grupo de pílulas (.choice-section-title). */
function SectionTitle({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <AppText size={fontSize.xs} weight={700} lineHeight={17} color={colors.muted} style={{ letterSpacing: 0.24 }}>
      {text}
    </AppText>
  );
}

/** "ou escolha" entre as excludentes e as opções comuns (.choice-divider); decorativo. */
function Divider() {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View
      style={styles.divider}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.line} />
      <AppText size={fontSize.xs} weight={600} color={colors.muted}>
        ou escolha
      </AppText>
      <View style={styles.line} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  pills: { gap: 12 },
  // .choice-sections / .choice-section: grupos com título, 14 px entre eles e 8 px até as pílulas.
  sections: { gap: 14 },
  section: { gap: 8 },
  // Excludentes lado a lado (crescem e centralizam o texto), 10 px entre elas.
  exclusiveRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  divider: { flexDirection: "row", alignItems: "center", gap: 16, marginVertical: 2 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  expand: { alignSelf: "flex-start", minHeight: 40 },
}));
