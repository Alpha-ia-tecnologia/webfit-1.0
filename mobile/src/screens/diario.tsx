import { Apple, Coffee, CookingPot, Heart, Plus, Sandwich, Search, Syringe, type LucideIcon } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { groupDiaryDay, mealWord, type DiarySearchHit } from "@shared/lib/diary-day";
import { dailyTargets, localDate, totalsFor } from "@shared/lib/domain";
import { longDate } from "@shared/lib/today";
import type { DiaryEntry } from "@shared/types";
import { BalanceBand, BalanceCard } from "@/components/diario/balance-card";
import { InjectionRow, WATER_QUICK_ML, WaterLine, WellbeingRow } from "@/components/diario/day-rows";
import { DiarySearch } from "@/components/diario/diary-search";
import { MealGroupCard } from "@/components/diario/meal-group-card";
import { QualityCard } from "@/components/diario/quality-card";
import { BalanceExplain } from "@/components/hoje/balance-explain";
import { DatePickerButton, WeekStrip } from "@/components/hoje/week-strip";
import { AppHeader } from "@/components/layout/app-header";
import { QuickEntryForm } from "@/components/quick/quick-entry-form";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, Empty, IconButton, MealCard, Sheet, type MealCardTone } from "@/components/ui";
import { ScreenInsightChips } from "@/components/signals/insight-chips";
import { useApp } from "@/state/app-context";
import { useDiaryActions } from "@/state/use-diary-actions";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, TAB_BAR_SPACE } from "@/theme/tokens";

/** Vaga de refeição sem registro: ícone e tom de cada uma (lanche azul: rosa é só para erro), como no web. */
const PENDING_SLOTS: Record<string, { icon: LucideIcon; tone: MealCardTone }> = {
  "Café da manhã": { icon: Coffee, tone: "amber" },
  Almoço: { icon: Sandwich, tone: "mint" },
  Lanche: { icon: Apple, tone: "sky" },
  Jantar: { icon: CookingPot, tone: "indigo" },
};
/** Abaixo desta largura a vaga pendente fica sem ícone (o @media 359px do web). */
const PENDING_TILE_MIN_WIDTH = 360;
const CONTENT_PADDING = 16;
/** Folga acima do registro destacado ao rolar até ele (a faixa do balanço fica por cima). */
const HIGHLIGHT_SCROLL_MARGIN = 120;
/** Espera o dia escolhido (e a lista de água, se for o caso) desenhar antes de medir a linha. */
const HIGHLIGHT_MEASURE_MS = 180;
/** Tempo do destaque de um resultado da busca. */
const HIGHLIGHT_MS = 2400;

/**
 * Diário do dia escolhido (DIARIO-02/08/09): balanço [Meta] − [Consumido] = [Restam], refeições
 * agrupadas por tipo, uma linha de água, bem-estar e aplicações; a lupa busca em todo o histórico.
 */
export function DiarioScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, date, setDate, editMeal, openInjection } = useApp();
  const insets = useSafeAreaInsets();
  const showPendingTile = useWindowDimensions().width >= PENDING_TILE_MIN_WIDTH;
  const actions = useDiaryActions();
  const p = state.profile!;
  const today = localDate();
  const [edit, setEdit] = useState<DiaryEntry | null>(null);
  const [isWellOpen, setWellOpen] = useState(false);
  const [isExplainOpen, setExplainOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [isBandShown, setBandShown] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const highlightRef = useRef<View>(null);
  const balanceBottom = useRef(Number.POSITIVE_INFINITY);
  const bandShown = useRef(false);
  const headerScroll = useSharedValue(0);
  const totals = totalsFor(state.diary, date);
  const goals = dailyTargets(state, date, today);
  const day = useMemo(
    () => groupDiaryDay({ diary: state.diary, injections: state.injections, date }),
    [state.diary, state.injections, date],
  );
  const usesPen = p.weightLossPen === "sim" || state.injections.length > 0;
  const addMeal = (category: string) => editMeal(null, { category });

  // Um resultado da busca abre o dia dele e rola até o registro, que fica destacado por um instante.
  useEffect(() => {
    if (!highlightId) return;
    const measure = setTimeout(() => {
      const row = highlightRef.current;
      const target = content.current;
      if (!row || !target) return;
      row.measureLayout(target, (_x, y) =>
        scroller.current?.scrollTo({
          y: Math.max(0, y + CONTENT_PADDING - HIGHLIGHT_SCROLL_MARGIN),
          animated: Platform.OS !== "web",
        }),
      );
    }, HIGHLIGHT_MEASURE_MS);
    const clear = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => {
      clearTimeout(measure);
      clearTimeout(clear);
    };
  }, [highlightId]);

  /** A faixa compacta aparece quando o cartão do balanço sai por cima da tela; o título encolhe ao rolar. */
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    headerScroll.value = event.nativeEvent.contentOffset.y;
    const shown = event.nativeEvent.contentOffset.y > balanceBottom.current;
    if (shown === bandShown.current) return;
    bandShown.current = shown;
    setBandShown(shown);
  };
  const pick = (hit: DiarySearchHit) => {
    setSearchOpen(false);
    setDate(hit.date);
    setHighlightId(hit.id);
  };
  const rowActions = {
    hideCalories: p.hideCalories,
    repeatLabel: date === today ? "Repetir agora" : "Repetir hoje",
    highlightId,
    highlightRef,
    onEdit: (entry: DiaryEntry) => editMeal(entry),
    onRepeat: (entry: DiaryEntry) => void actions.repeatMeal(entry.items ?? []),
    onRemove: (entry: DiaryEntry) => actions.removeEntry(entry.id),
  };

  return (
    <View style={styles.root}>
      <AppHeader
        variant="large"
        title="Meu diário"
        kicker={longDate(date)}
        actions={
          <>
            {/* Conceito 03: a lupa fica no cabeçalho, ao lado do calendário. */}
            <IconButton icon={Search} variant="header" accessibilityLabel="Buscar no diário" expanded={isSearchOpen} onPress={() => setSearchOpen(true)} />
            <DatePickerButton value={date} onChange={setDate} inputLabel="Data dos registros" />
          </>
        }
        extra={<WeekStrip value={date} onChange={setDate} isBrowsable />}
        scrollY={headerScroll}
      />
      <View style={styles.root}>
        <ScrollView
          ref={scroller}
          style={styles.root}
          contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={content} style={styles.stack}>
            {/* Sinais do app sobre os últimos dias (chips + folha), logo abaixo do cabeçalho: só no dia de hoje. */}
            {date === today && <ScreenInsightChips screen="diario" />}
            <BalanceCard
              totals={totals}
              goals={goals}
              hideCalories={p.hideCalories}
              isToday={date === today}
              onExplain={() => setExplainOpen(true)}
              onLayout={(e) => {
                balanceBottom.current = CONTENT_PADDING + e.nativeEvent.layout.y + e.nativeEvent.layout.height;
              }}
            />

            {day.isEmpty && (
              <Card>
                <Empty art="diary">Nenhum registro encontrado para este dia. Seus primeiros registros aparecerão aqui.</Empty>
              </Card>
            )}

            <View style={styles.section}>
              <AppText heading size={fontSize.xl} weight={800} tracking={-0.01} accessibilityRole="header">
                Refeições
              </AppText>
              <AppText style={srOnly}>
                {day.count} {day.count === 1 ? "registro" : "registros"} neste dia
              </AppText>
              {day.meals.map((group) => (
                <MealGroupCard key={group.category} group={group} onAdd={addMeal} {...rowActions} />
              ))}
              {day.pending.length > 0 && (
                // Refeições do dia ainda sem registro: vagas tracejadas de meia largura, sem cobrança (conceito 03).
                <View role="group" accessibilityLabel="Adicionar refeição" style={styles.pending}>
                  {day.pending.map((category) => {
                    const slot = PENDING_SLOTS[category] ?? PENDING_SLOTS.Jantar!;
                    return (
                      <View key={category} style={styles.pendingCell}>
                        <MealCard
                          variant="slot"
                          compact
                          title={category}
                          icon={slot.icon}
                          tone={slot.tone}
                          showTile={showPendingTile}
                          subtitle={
                            <View style={styles.pendingAdd}>
                              <Plus size={16} strokeWidth={2.5} color={colors.green700} />
                              <AppText size={fontSize.md} weight={800} color={colors.green700}>
                                Adicionar
                              </AppText>
                            </View>
                          }
                          onPress={() => addMeal(category)}
                          pressLabel={`Adicionar ${mealWord(category)}`}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <AppText heading size={fontSize.xl} weight={800} tracking={-0.01} accessibilityRole="header">
                Água e bem-estar
              </AppText>
                <WaterLine
                  totalMl={day.water.totalMl}
                  goalMl={goals.water}
                  entries={day.water.entries}
                  highlightId={highlightId}
                  highlightRef={highlightRef}
                  onAdd={() => void actions.addWater(WATER_QUICK_ML, date)}
                  onEdit={setEdit}
                  onRemove={actions.removeEntry}
                />
                {day.wellbeing.map((entry) => (
                  <WellbeingRow
                    key={entry.id}
                    entry={entry}
                    isHighlighted={highlightId === entry.id}
                    highlightRef={highlightRef}
                    onEdit={() => setEdit(entry)}
                    onRemove={() => actions.removeEntry(entry.id)}
                  />
                ))}
                <Button label="Registrar bem-estar" variant="text" icon={Heart} onPress={() => setWellOpen(true)} style={styles.textButton} />
            </View>

            <QualityCard date={date} />

            {(day.injections.length > 0 || usesPen) && (
              <View style={styles.section}>
                <AppText heading size={fontSize.xl} weight={800} tracking={-0.01} accessibilityRole="header">
                  Medicação injetável
                </AppText>
                {day.injections.map((entry) => (
                  <InjectionRow
                    key={entry.id}
                    entry={entry}
                    isHighlighted={highlightId === entry.id}
                    highlightRef={highlightRef}
                    onEdit={() => openInjection(entry)}
                    onRemove={() => actions.removeInjection(entry.id)}
                  />
                ))}
                {usesPen && (
                  <Button label="Registrar aplicação" variant="text" icon={Syringe} onPress={() => openInjection(null)} style={styles.textButton} />
                )}
              </View>
            )}
          </View>
        </ScrollView>
        {isBandShown && <BalanceBand totals={totals} goals={goals} hideCalories={p.hideCalories} />}
      </View>

      <Sheet visible={!!edit && edit.type !== "refeicao"} title="Editar registro" onClose={() => setEdit(null)}>
        {edit && edit.type !== "refeicao" && <QuickEntryForm entry={edit} type={edit.type} onDone={() => setEdit(null)} />}
      </Sheet>
      <Sheet visible={isWellOpen} title="Registrar bem-estar" onClose={() => setWellOpen(false)}>
        {isWellOpen && <QuickEntryForm type="bem_estar" onDone={() => setWellOpen(false)} />}
      </Sheet>
      <BalanceExplain
        visible={isExplainOpen && !p.hideCalories}
        consumed={totals.calories}
        goals={goals}
        onClose={() => setExplainOpen(false)}
      />
      <DiarySearch visible={isSearchOpen} onPick={pick} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: CONTENT_PADDING },
  stack: { gap: 14 },
  section: { gap: 12, marginTop: 6 },
  /** Duas vagas por linha (grade 2 × 1fr do web). */
  pending: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  pendingCell: { flexBasis: "45%", flexGrow: 1, minWidth: 0 },
  pendingAdd: { flexDirection: "row", alignItems: "center", gap: 4 },
  textButton: { alignSelf: "flex-start" },
}));
