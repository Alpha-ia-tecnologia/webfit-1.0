import { usePathname } from "expo-router";
import { Camera, Droplets, Heart, Images, Scale, Syringe, Utensils, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { mealSummary } from "@shared/lib/diary-day";
import { localDate } from "@shared/lib/domain";
import { dishesFrom, recentMeals, type Dish } from "@shared/lib/meals";
import { COPY } from "@shared/lib/copy";
import { AppText, Button, Sheet } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { MEAL_PHOTO_MAX_BYTES, pickPhoto } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { useDiaryActions } from "@/state/use-diary-actions";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type Domain } from "@/theme/tokens";
import { QuickEntryForm } from "./quick-entry-form";
import { WeightForm } from "./weight-form";

type Mode = "grid" | "agua" | "bem_estar" | "peso" | "foto";
type Tile = { key: string; label: string; hint: string; icon: LucideIcon; domain: Domain; run: () => void };

/** Pratos na fileira "Repetir" (1 toque + Desfazer). */
const REPEAT_LIMIT = 3;
const COLUMNS = 3;
const TITLES: Record<Mode, string> = {
  grid: COPY.quickLog,
  agua: "Registrar água",
  bem_estar: "Registrar bem-estar",
  peso: "Peso",
  foto: "Foto do prato",
};

function TileButton({ tile }: { tile: Tile }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const Icon = tile.icon;
  const tone = themeDomainTone(scheme)[tile.domain];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      onPress={() => {
        selectionHaptic();
        tile.run();
      }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: tone.bg, borderColor: tone.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.tileIcon}>
        <Icon size={20} color={tone.fg} />
      </View>
      <AppText size={fontSize.sm} weight={700} align="center" numberOfLines={1}>
        {tile.label}
      </AppText>
      <AppText
        size={fontSize["2xs"]}
        color={colors.muted}
        align="center"
        numberOfLines={2}
        importantForAccessibility="no"
        aria-hidden
      >
        {tile.hint}
      </AppText>
    </Pressable>
  );
}

function RepeatCard({ dish, onPress }: { dish: Dish; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Repetir agora: ${dish.title}, ${dish.when ? `de ${dish.when}` : "favorito"}`}
      onPress={onPress}
      style={({ pressed }) => [styles.repeat, pressed && styles.repeatPressed]}
    >
      <AppText size={fontSize.sm} weight={700} numberOfLines={1}>
        {dish.title}
      </AppText>
      <AppText size={fontSize["2xs"]} color={colors.muted} numberOfLines={2} lineHeight={15}>
        {mealSummary({ items: dish.items, description: "" }).text}
      </AppText>
      <AppText size={fontSize["2xs"]} weight={700} color={colors.green800}>
        {dish.when ?? "favorito"}
      </AppText>
    </Pressable>
  );
}

/**
 * Registro rápido (HOJE-02): folha com a grade 3×2 (Refeição, Foto do prato, Água, Bem-estar, Peso e,
 * para quem usa caneta, Aplicação) e a fileira "Repetir" com 3 pratos recentes. Aberto no Diário,
 * registra no dia aberto; em qualquer outra tela, hoje. A foto só é anexada à refeição nova (não
 * estima calorias).
 */
export function QuickLogSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, date, setDate, editMeal, openInjection, notify } = useApp();
  const actions = useDiaryActions();
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("grid");
  const today = localDate();
  const logDate = pathname === "/diario" ? date : today;
  // Refeição, água e bem-estar leem o dia do contexto: alinha antes de abrir o formulário.
  const alignDate = () => {
    if (date !== logDate) setDate(logDate);
  };
  // Fechada por qualquer caminho (abrir a refeição, navegar), a folha volta à grade.
  useEffect(() => {
    if (!visible) setMode("grid");
  }, [visible]);
  const close = () => {
    setMode("grid");
    onClose();
  };
  const p = state.profile;
  const usesPen = p?.weightLossPen === "sim" || state.injections.length > 0;
  const dishes = dishesFrom(state.savedMeals, recentMeals(state.diary), today).slice(0, REPEAT_LIMIT);
  const tiles: Tile[] = [
    {
      key: "refeicao",
      label: "Refeição",
      hint: "buscar alimentos",
      icon: Utensils,
      domain: "food",
      run: () => {
        alignDate();
        editMeal(null);
      },
    },
    { key: "foto", label: "Foto do prato", hint: "anexa ao registro", icon: Camera, domain: "food", run: () => setMode("foto") },
    {
      key: "agua",
      label: "Água",
      hint: "copo ou volume",
      icon: Droplets,
      domain: "water",
      run: () => {
        alignDate();
        setMode("agua");
      },
    },
    {
      key: "bem_estar",
      label: "Bem-estar",
      hint: "humor e sono",
      icon: Heart,
      domain: "mind",
      run: () => {
        alignDate();
        setMode("bem_estar");
      },
    },
    { key: "peso", label: "Peso", hint: "±0,1 kg", icon: Scale, domain: "body", run: () => setMode("peso") },
    ...(usesPen
      ? [
          {
            key: "aplicacao",
            label: "Aplicação",
            hint: "seringa e dose",
            icon: Syringe,
            domain: "medication" as const,
            run: () => openInjection(null),
          },
        ]
      : []),
  ];
  const rows = Array.from({ length: Math.ceil(tiles.length / COLUMNS) }, (_, i) =>
    tiles.slice(i * COLUMNS, i * COLUMNS + COLUMNS),
  );
  /** A foto passa pelas mesmas regras do anexo da tela de refeição (redução e limite de tamanho). */
  const attachDishPhoto = async (source: "camera" | "library") => {
    try {
      const picked = await pickPhoto(source, MEAL_PHOTO_MAX_BYTES);
      if (!picked) return;
      alignDate();
      editMeal(null, { photo: picked.dataUrl });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível anexar a foto.", "warning");
    }
  };
  const repeat = async (dish: Dish) => {
    if (await actions.repeatMeal(dish.items)) close();
  };

  return (
    <Sheet visible={visible} title={TITLES[mode]} onClose={close}>
      {mode === "agua" || mode === "bem_estar" ? (
        <QuickEntryForm type={mode} onDone={close} />
      ) : mode === "peso" ? (
        <WeightForm day={logDate} onDone={close} />
      ) : mode === "foto" ? (
        <View style={styles.sources}>
          <AppText size={fontSize.sm} color={colors.muted}>
            A foto fica junto da refeição nova; os alimentos você escolhe na busca.
          </AppText>
          <View style={styles.sourceRow}>
            <Button label="Câmera" variant="secondary" icon={Camera} onPress={() => void attachDishPhoto("camera")} style={styles.source} />
            <Button label="Galeria" variant="secondary" icon={Images} onPress={() => void attachDishPhoto("library")} style={styles.source} />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            {rows.map((row, index) => (
              <View key={index} style={styles.row}>
                {row.map((tile) => (
                  <TileButton key={tile.key} tile={tile} />
                ))}
                {Array.from({ length: COLUMNS - row.length }, (_, i) => (
                  <View key={`vazio-${i}`} style={styles.spacer} />
                ))}
              </View>
            ))}
          </View>
          {dishes.length > 0 && (
            <View style={styles.repeatSection}>
              <AppText size={fontSize.xs} weight={800} upper tracking={0.06} color={colors.muted} accessibilityRole="header">
                Repetir
              </AppText>
              <View style={styles.row}>
                {dishes.map((dish) => (
                  <RepeatCard key={dish.id} dish={dish} onPress={() => void repeat(dish)} />
                ))}
                {Array.from({ length: REPEAT_LIMIT - dishes.length }, (_, i) => (
                  <View key={`vazio-${i}`} style={styles.spacer} />
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  grid: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  spacer: { flex: 1 },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 98,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  repeatSection: { gap: 8 },
  repeat: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    gap: 2,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  repeatPressed: { borderColor: colors.mint200, backgroundColor: colors.mint50 },
  sources: { gap: 12 },
  sourceRow: { flexDirection: "row", gap: 12 },
  source: { flex: 1 },
}));
