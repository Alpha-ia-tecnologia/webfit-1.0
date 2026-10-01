import { ChevronDown, ChevronUp, Minus, Plus, Trash2, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { localDate, shiftDate } from "@shared/lib/dates";
import { PANTRY_UNITS } from "@shared/lib/pantry";
import { canDecreaseQuantity, EXPIRY_SHORTCUTS, pantryEmoji } from "@shared/lib/pantry-view";
import { visiblePlainText } from "@shared/lib/text";
import type { PantryDraft } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import {
  AppText,
  Button,
  ChipRow,
  DateField,
  IconButton,
  IconTile,
  Notice,
  QuickChip,
  SectionHead,
  TextField,
} from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { AreaAlert, AreaStatus } from "./area-status";
import { AFTER_MENU_MS, focusWithin } from "./focus";
import { ToggleRow } from "./toggle-row";
import { BUSY_TEXT, LOCATION_OPTIONS, type PantryBusy } from "./types";

/** Alvo de toque real dos botões "−"/"+" e dos atalhos de validade. */
const MIN_TOUCH = 44;
/** Mesmo limite do web ("Adicionar outro item"). */
const MAX_DRAFTS = 60;
const UNIT_OPTIONS = Object.entries(PANTRY_UNITS) as [PantryDraft["unit"], string][];

export type ReviewActions = {
  onPatch: (index: number, value: Partial<PantryDraft>) => void;
  onQuantityText: (index: number, text: string) => void;
  onStep: (index: number, direction: 1 | -1) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onSave: () => void;
  onDiscard: () => void;
};

type Props = ReviewActions & {
  drafts: PantryDraft[];
  quantities: string[];
  /** Chave estável de cada linha (a revisão não tem ids). */
  keys: string[];
  isEditing: boolean;
  busy: PantryBusy;
  hide: boolean;
  /** Observações do reconhecimento (texto do modelo). */
  notes: string;
  error: string | null;
};

/** Revisão compacta dos itens antes de salvar (AGENTE-10): nada é salvo sem confirmação. */
export function PantryReview(props: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { drafts, keys, isEditing, busy } = props;
  const isBusy = !!busy;
  const inputs = useRef(new Map<string, TextInput>());
  const addButton = useRef<View>(null);
  /** Linha que recebe o foco depois de incluir ou remover ("add" = botão "Adicionar outro item"). */
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    if (target === "add") focusWithin(addButton.current);
    else inputs.current.get(target === "last" ? keys[keys.length - 1]! : target)?.focus();
  }, [keys]);
  // O botão que abriu a revisão sumiu (bloco "Digitar", "Reconhecer" ou o "⋯ Editar"): no export web
  // o foco vai para o nome do 1º item, depois de o menu devolver o foco ao "⋯". No aparelho, o
  // teclado não abre sozinho.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const first = keys[0];
    const timer = setTimeout(() => first && inputs.current.get(first)?.focus(), isEditing ? AFTER_MENU_MS : 0);
    return () => clearTimeout(timer);
    // Só ao abrir a revisão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.root}>
      {/* Na edição, o título da folha ("Editar alimento") já diz o que é. */}
      {!isEditing && <SectionHead title="Revise os itens antes de salvar" />}
      <AppText size={fontSize.sm} color={colors.muted}>
        Quantidade e validade são opcionais.
      </AppText>
      {!!props.notes && <Notice>{visiblePlainText(props.notes, props.hide)}</Notice>}
      {props.error ? <AreaAlert text={props.error} /> : null}
      {drafts.map((item, index) => (
        <DraftRow
          key={keys[index]}
          {...props}
          item={item}
          index={index}
          isBusy={isBusy}
          inputRef={(node) => {
            if (node) inputs.current.set(keys[index]!, node);
            else inputs.current.delete(keys[index]!);
          }}
          onRemoveRow={() => {
            // O nome da linha seguinte; na última, "Adicionar outro item" (como no web).
            pending.current = keys[index + 1] ?? "add";
            props.onRemove(index);
          }}
        />
      ))}
      {busy === "saving_items" && <AreaStatus text={BUSY_TEXT.saving_items} />}
      {!isEditing && (
        <View ref={addButton} collapsable={false} style={styles.self}>
          <Button
            label="Adicionar outro item"
            icon={Plus}
            variant="secondary"
            disabled={isBusy || drafts.length >= MAX_DRAFTS}
            onPress={() => {
              pending.current = "last";
              props.onAdd();
            }}
          />
        </View>
      )}
      <Button label="Confirmar e salvar itens" disabled={isBusy || !drafts.length} onPress={props.onSave} />
      <Button label="Descartar revisão" variant="text" disabled={isBusy} onPress={props.onDiscard} />
    </View>
  );
}

type RowProps = Props & {
  item: PantryDraft;
  index: number;
  isBusy: boolean;
  inputRef: (node: TextInput | null) => void;
  onRemoveRow: () => void;
};

function DraftRow({ item, index, isBusy, isEditing, quantities, inputRef, onRemoveRow, onPatch, onQuantityText, onStep }: RowProps) {
  const styles = useStyles();
  const n = index + 1;
  const [isNoteOpen, setNoteOpen] = useState(item.notes.trim() !== "");
  return (
    <View role="group" accessibilityLabel={`Item ${n}`} testID="pantry-draft-row" style={styles.row}>
      <View style={styles.nameLine}>
        <IconTile size="md" glyph={pantryEmoji(item.name)} />
        <TextField
          // React 19 entrega o ref como prop; o TextField o repassa ao TextInput (os tipos não o declaram).
          {...{ ref: inputRef }}
          accessibilityLabel={`Nome do item ${n}`}
          placeholder="Nome do alimento"
          editable={!isBusy}
          value={item.name}
          maxLength={120}
          onChangeText={(name) => onPatch(index, { name })}
          style={styles.grow}
        />
        {!isEditing && (
          <IconButton icon={Trash2} accessibilityLabel={`Remover item ${n} da revisão`} disabled={isBusy} onPress={onRemoveRow} />
        )}
      </View>
      <View style={styles.field}>
        <Caption text="Quantidade" />
        <View style={styles.stepper}>
          <StepButton
            icon={Minus}
            label={`Diminuir quantidade do item ${n}`}
            disabled={isBusy || !canDecreaseQuantity(item.quantity, item.unit)}
            onPress={() => onStep(index, -1)}
          />
          <TextField
            accessibilityLabel={`Quantidade do item ${n}`}
            editable={!isBusy}
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={quantities[index] ?? ""}
            placeholder="Não informada"
            onChangeText={(text) => onQuantityText(index, text)}
            style={[styles.grow, styles.quantity]}
          />
          <StepButton icon={Plus} label={`Aumentar quantidade do item ${n}`} disabled={isBusy} onPress={() => onStep(index, 1)} />
        </View>
      </View>
      <View style={styles.field}>
        <Caption text="Unidade" />
        <View role="group" accessibilityLabel={`Unidade do item ${n}`}>
          <ChipRow>
            {UNIT_OPTIONS.map(([key, label]) => (
              <QuickChip
                key={key}
                label={label}
                isOn={item.unit === key}
                style={styles.chip}
                onPress={() => {
                  if (isBusy || item.unit === key) return;
                  selectionHaptic();
                  onPatch(index, { unit: key });
                }}
              />
            ))}
          </ChipRow>
        </View>
      </View>
      <ToggleRow
        label={`Guardar item ${n} em`}
        caption="Guardar em"
        options={LOCATION_OPTIONS}
        value={item.location}
        onChange={(location) => onPatch(index, { location })}
        disabled={isBusy}
      />
      <Validity item={item} n={n} isBusy={isBusy} onChange={(expiresOn) => onPatch(index, { expiresOn })} />
      <Button
        label="Observação"
        accessibilityLabel={`Observação do item ${n}`}
        variant="text"
        iconRight={isNoteOpen ? ChevronUp : ChevronDown}
        expanded={isNoteOpen}
        onPress={() => {
          selectionHaptic();
          setNoteOpen((open) => !open);
        }}
      />
      {isNoteOpen && (
        <TextField
          accessibilityLabel={`Observações do item ${n}`}
          editable={!isBusy}
          value={item.notes}
          maxLength={500}
          onChangeText={(notes) => onPatch(index, { notes })}
        />
      )}
    </View>
  );
}

/** "+3 d" / "+7 d", a data escolhida nas rodas e "Limpar validade". */
function Validity({ item, n, isBusy, onChange }: { item: PantryDraft; n: number; isBusy: boolean; onChange: (value: string | null) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const today = localDate();
  return (
    <View role="group" accessibilityLabel={`Validade do item ${n}`} style={styles.validity}>
      <View style={styles.shortcuts}>
        {EXPIRY_SHORTCUTS.map((days) => {
          const date = shiftDate(today, days);
          const isOn = item.expiresOn === date;
          return (
            <Pressable
              key={days}
              accessibilityRole="button"
              accessibilityLabel={`+${days} dias de validade do item ${n}`}
              accessibilityState={{ selected: isOn, disabled: isBusy }}
              {...webAttrs({ "aria-pressed": isOn })}
              disabled={isBusy}
              onPress={() => {
                selectionHaptic();
                onChange(date);
              }}
              style={({ pressed }) => [styles.shortcut, isOn && styles.shortcutOn, pressed && styles.pressed, isBusy && styles.disabled]}
            >
              <AppText size={fontSize.sm} weight={700} color={isOn ? colors.white : colors.text2}>
                {`+${days} d`}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <DateField
        label="Validade"
        value={item.expiresOn ?? ""}
        onChange={(value) => {
          if (!isBusy) onChange(value || null);
        }}
      />
      {!!item.expiresOn && <Button label="Limpar validade" variant="text" disabled={isBusy} onPress={() => onChange(null)} />}
    </View>
  );
}

function StepButton({ icon: Icon, label, disabled, onPress }: { icon: LucideIcon; label: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.step, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon size={18} color={colors.text2} />
    </Pressable>
  );
}

function Caption({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <AppText size={fontSize.sm} weight={600} color={colors.text2}>
      {text}
    </AppText>
  );
}

const useStyles = makeStyles((colors) => ({
  /** Dentro da folha "Adicionar alimentos" (o Card saiu com o formulário da tela). */
  root: { gap: 12 },
  self: { alignSelf: "flex-start" },
  row: {
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  field: { gap: 7 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  quantity: { textAlign: "center" },
  step: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chip: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: "center" },
  validity: { gap: 8 },
  shortcuts: { flexDirection: "row", gap: 8 },
  shortcut: {
    minHeight: MIN_TOUCH,
    minWidth: 64,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shortcutOn: { backgroundColor: colors.green600, borderColor: colors.green600 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
}));
