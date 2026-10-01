import { useState, type FormEvent } from "react";
import { foodSchema, type FoodItem } from "../../types";
import { useApp } from "../../lib/context";
import { uid } from "../../lib/domain";
import { energyFromMacros } from "../../lib/meals";
import { Field, Modal } from "../UI";

interface Nutrition {
  caloriesPer100g: string;
  proteinPer100g: string;
  carbsPer100g: string;
  fatPer100g: string;
}
const NUTRIENTS: [keyof Nutrition, string, number][] = [
  ["caloriesPer100g", "Valor energético (kcal)", 1000],
  ["proteinPer100g", "Proteínas (g)", 100],
  ["carbsPer100g", "Carboidratos (g)", 100],
  ["fatPer100g", "Gorduras totais (g)", 100],
];
const EMPTY: Nutrition = {
  caloriesPer100g: "",
  proteinPer100g: "",
  carbsPer100g: "",
  fatPer100g: "",
};

/**
 * Cadastra um alimento com os valores por 100 g transcritos do rótulo. Com "Ocultar calorias",
 * não pede nem mostra a energia: ela é calculada pelos macros (4/4/9 kcal por grama).
 */
export function LabelFoodModal({
  hideCalories,
  onClose,
  onSaved,
}: {
  hideCalories: boolean;
  onClose: () => void;
  onSaved: (food: FoodItem) => void;
}) {
  const { commit, notify } = useApp();
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [nutrition, setNutrition] = useState<Nutrition>(EMPTY);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const values = Object.fromEntries(
      Object.entries(nutrition).map(([k, v]) => [k, Number(v.replace(",", "."))]),
    ) as Record<keyof Nutrition, number>;
    const result = foodSchema.safeParse({
      id: uid(),
      name,
      category: "Meus alimentos",
      source,
      ...values,
      caloriesPer100g: hideCalories
        ? energyFromMacros({
            protein: values.proteinPer100g,
            carbs: values.carbsPer100g,
            fat: values.fatPer100g,
          })
        : values.caloriesPer100g,
    });
    if (!result.success) {
      notify("Confira o nome, a fonte e os valores por 100 g.", "warning");
      return;
    }
    if (await commit((s) => ({ ...s, foods: [...s.foods, result.data] }), "Alimento cadastrado e colocado no prato (100 g)."))
      onSaved(result.data);
  };
  return (
    <Modal title="Cadastrar alimento do rótulo" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Nome do alimento">
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Fonte dos valores">
          <input
            required
            maxLength={500}
            placeholder="Ex.: rótulo da marca, produto e data"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </Field>
        <p className="hint">
          {hideCalories
            ? "Transcreva proteínas, carboidratos e gorduras por 100 g, mesmo se o rótulo também mostrar outra porção."
            : "Transcreva os valores por 100 g, mesmo se o rótulo também mostrar outra porção."}
        </p>
        <div className="form-grid">
          {NUTRIENTS.filter(([key]) => !hideCalories || key !== "caloriesPer100g").map(([key, label, max]) => (
            <Field label={label} key={key}>
              <input
                type="number"
                required
                min="0"
                max={max}
                step="0.01"
                value={nutrition[key]}
                onChange={(e) => setNutrition((n) => ({ ...n, [key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <button className="btn">Salvar alimento</button>
      </form>
    </Modal>
  );
}
