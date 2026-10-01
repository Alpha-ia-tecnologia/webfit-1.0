import { useRef, useState } from "react";
import { View } from "react-native";
import { uid } from "@shared/lib/domain";
import { energyFromMacros } from "@shared/lib/meals";
import { foodSchema, type FoodItem } from "@shared/types";
import { AppText, Button, Field, Sheet, TextField } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

type Nutrition = {
  caloriesPer100g: string;
  proteinPer100g: string;
  carbsPer100g: string;
  fatPer100g: string;
};
const NUTRIENTS: [keyof Nutrition, string][] = [
  ["caloriesPer100g", "Valor energético (kcal)"],
  ["proteinPer100g", "Proteínas (g)"],
  ["carbsPer100g", "Carboidratos (g)"],
  ["fatPer100g", "Gorduras totais (g)"],
];
const EMPTY: Nutrition = { caloriesPer100g: "", proteinPer100g: "", carbsPer100g: "", fatPer100g: "" };
/** Aceita vírgula decimal do teclado brasileiro; vazio continua inválido. */
const toNumber = (text: string) => (text.trim() ? Number(text.trim().replace(",", ".")) : Number.NaN);

type Props = {
  hideCalories: boolean;
  onClose: () => void;
  onSaved: (food: FoodItem) => void;
};

/**
 * Cadastra um alimento com os valores por 100 g transcritos do rótulo. Montado só enquanto
 * aberto: cada abertura começa com o formulário vazio, como no web. Com "Ocultar calorias",
 * não pede nem mostra a energia: ela é calculada pelos macros (4/4/9 kcal por grama).
 */
export function LabelFoodSheet({ hideCalories, onClose, onSaved }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { commit, notify } = useApp();
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [nutrition, setNutrition] = useState<Nutrition>(EMPTY);
  const [busy, setBusy] = useState(false);
  // O estado só muda no próximo render: o ref barra o segundo toque no mesmo instante.
  const saving = useRef(false);
  const save = async () => {
    if (saving.current) return;
    const values = Object.fromEntries(
      Object.entries(nutrition).map(([k, v]) => [k, toNumber(v)]),
    ) as Record<keyof Nutrition, number>;
    const result = foodSchema.safeParse({
      id: uid(),
      name,
      category: "Meus alimentos",
      source,
      ...values,
      caloriesPer100g: hideCalories
        ? energyFromMacros({ protein: values.proteinPer100g, carbs: values.carbsPer100g, fat: values.fatPer100g })
        : values.caloriesPer100g,
    });
    if (!result.success) {
      notify("Confira o nome, a fonte e os valores por 100 g.", "warning");
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const ok = await commit(
        (s) => ({ ...s, foods: [...s.foods, result.data] }),
        "Alimento cadastrado e colocado no prato (100 g).",
      );
      if (ok) onSaved(result.data);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const fields = NUTRIENTS.filter(([key]) => !hideCalories || key !== "caloriesPer100g");
  return (
    <Sheet
      visible
      title="Cadastrar alimento do rótulo"
      onClose={onClose}
      footer={<Button label="Salvar alimento" busy={busy} onPress={() => void save()} wide />}
    >
      <Field label="Nome do alimento">
        <TextField maxLength={200} value={name} onChangeText={setName} accessibilityLabel="Nome do alimento" />
      </Field>
      <Field label="Fonte dos valores">
        <TextField
          maxLength={500}
          placeholder="Ex.: rótulo da marca, produto e data"
          value={source}
          onChangeText={setSource}
          accessibilityLabel="Fonte dos valores"
        />
      </Field>
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
        {hideCalories
          ? "Transcreva proteínas, carboidratos e gorduras por 100 g, mesmo se o rótulo também mostrar outra porção."
          : "Transcreva os valores por 100 g, mesmo se o rótulo também mostrar outra porção."}
      </AppText>
      <View style={styles.grid}>
        {fields.map(([key, label]) => (
          <Field key={key} label={label} style={styles.half}>
            <TextField
              inputMode="decimal"
              value={nutrition[key]}
              onChangeText={(text) => setNutrition((n) => ({ ...n, [key]: text }))}
              accessibilityLabel={label}
            />
          </Field>
        ))}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  half: { flexBasis: "46%", flexGrow: 1 },
}));
