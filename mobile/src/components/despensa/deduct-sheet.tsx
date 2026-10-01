import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { COOK_COPY } from "@shared/lib/cook-timer";
import {
  applyDeduction,
  canDecreaseRow,
  deductChoices,
  deductDetail,
  deductSummary,
  setDeductChoice,
  stepDeductRow,
  type DeductChoice,
  type DeductRow,
} from "@shared/lib/pantry-deduct";
import { fmtPantryQuantity } from "@shared/lib/pantry-view";
import { visiblePlainText } from "@shared/lib/text";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, IconButton, Sheet } from "@/components/ui";
import { useIosAnnouncement } from "@/lib/announce";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** Alvo real das opções (o web ignora hitSlop). */
const MIN_TOUCH = 44;

/** "Não mexer / Sobrou / Acabou" como rádios de 44 px (sem "Sobrou" quando a quantidade é desconhecida). */
function ChoiceGroup({ row, label, onChoose }: { row: DeductRow; label: string; onChoose: (choice: DeductChoice) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="radiogroup" aria-label={label} style={styles.choices}>
      {deductChoices(row).map((choice) => {
        const isOn = row.choice === choice;
        return (
          <Pressable
            key={choice}
            accessibilityRole="radio"
            accessibilityLabel={COOK_COPY.deductChoices[choice]}
            accessibilityState={{ checked: isOn }}
            {...webAttrs({ "aria-checked": isOn })}
            onPress={() => onChoose(choice)}
            style={({ pressed }) => [styles.choice, isOn && styles.choiceOn, pressed && styles.pressed]}
          >
            <AppText size={fontSize.sm} weight={isOn ? 700 : 600} color={isOn ? colors.green800 : colors.text2} numberOfLines={1}>
              {COOK_COPY.deductChoices[choice]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function DeductItem({ row, hide, onChange }: { row: DeductRow; hide: boolean; onChange: (row: DeductRow) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const name = visiblePlainText(row.name, hide);
  return (
    <View role="listitem" testID="deduct-row" style={styles.item}>
      <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
        {name}
      </AppText>
      <AppText size={fontSize.xs} color={colors.muted}>
        {deductDetail(row, hide)}
      </AppText>
      <ChoiceGroup
        row={row}
        label={`O que ficou de ${name}`}
        onChoose={(choice) => {
          selectionHaptic();
          onChange(setDeductChoice(row, choice));
        }}
      />
      {row.choice === "left" ? (
        <View style={styles.stepper}>
          <IconButton
            icon={Minus}
            accessibilityLabel={`Diminuir quantidade de ${name}`}
            disabled={!canDecreaseRow(row)}
            onPress={() => onChange(stepDeductRow(row, -1))}
          />
          <AppText size={fontSize.md} weight={700} style={styles.amount}>
            {fmtPantryQuantity(row.remaining, row.unit)}
          </AppText>
          <IconButton
            icon={Plus}
            accessibilityLabel={`Aumentar quantidade de ${name}`}
            onPress={() => onChange(stepDeductRow(row, 1))}
          />
        </View>
      ) : null}
    </View>
  );
}

type Props = {
  visible: boolean;
  rows: readonly DeductRow[];
  hide: boolean;
  onRows: (rows: DeductRow[]) => void;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * "Descontar da despensa" (AGENTE-11), aberto na tela da Despensa depois do modo preparo: para cada
 * item da casa da receita, "Não mexer", "Sobrou" (com −/+) ou "Acabou". A sugestão sai da quantidade
 * da receita quando dá para ler com segurança; nada muda sem "Atualizar despensa".
 */
export function DeductSheet({ visible, rows, hide, onRows, onConfirm, onClose }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const changes = applyDeduction(state, rows, new Date().toISOString()).before.length;
  const summary = deductSummary(rows);
  // O resumo muda a cada escolha: região viva no Android e no web; no iOS, o leitor de tela fala.
  useIosAnnouncement(summary, visible);
  const footer = (
    <View style={styles.footer}>
      <AppText size={fontSize.sm} weight={600} color={colors.text2} accessibilityLiveRegion="polite" testID="deduct-summary">
        {summary}
      </AppText>
      <Button label={COOK_COPY.deductConfirm} wide disabled={!changes} onPress={onConfirm} />
    </View>
  );
  return (
    <Sheet visible={visible} title={COOK_COPY.deduct} onClose={onClose} footer={footer}>
      <View role="list" testID="deduct-sheet" style={styles.list}>
        {rows.map((row, index) => (
          <DeductItem
            key={row.itemId}
            row={row}
            hide={hide}
            onChange={(next) => onRows(rows.map((r, i) => (i === index ? next : r)))}
          />
        ))}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  list: { gap: 18 },
  item: { gap: 8 },
  choices: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  choice: {
    flex: 1,
    minWidth: 0,
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  choiceOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.green600 },
  pressed: { opacity: 0.7 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  amount: { minWidth: 90, textAlign: "center", fontVariant: ["tabular-nums"] },
  footer: { gap: 8 },
}));
