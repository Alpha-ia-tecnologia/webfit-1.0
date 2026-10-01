import { useDeferredValue, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { searchDiary, type DiarySearchHit } from "@shared/lib/diary-day";
import { localDate } from "@shared/lib/domain";
import { humanDate } from "@shared/lib/today";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, SearchField, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const MIN_CHARS = 2;

/** Lupa do Diário (DIARIO-02): busca em todos os dias; escolher um resultado abre o dia dele. */
export function DiarySearch({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (hit: DiarySearchHit) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const groups = useMemo(
    () => searchDiary(state.diary, state.injections, deferred),
    [state.diary, state.injections, deferred],
  );
  const count = groups.reduce((total, group) => total + group.hits.length, 0);
  const isSearching = deferred.replace(/\s/g, "").length >= MIN_CHARS;
  const today = localDate();
  const close = () => {
    setQuery("");
    onClose();
  };
  return (
    <Sheet visible={visible} title="Buscar no diário" onClose={close}>
      <SearchField
        autoFocus
        label="Buscar em todo o diário"
        placeholder="Alimento, água, bem-estar…"
        value={query}
        onChange={setQuery}
      />
      <AppText style={srOnly} accessibilityLiveRegion="polite" role="status">
        {isSearching ? `${count} ${count === 1 ? "resultado" : "resultados"}` : ""}
      </AppText>
      {!isSearching ? (
        <AppText size={fontSize.sm} color={colors.muted}>
          Digite pelo menos 2 letras para buscar em todos os dias.
        </AppText>
      ) : !count ? (
        <AppText size={fontSize.sm} color={colors.muted}>
          Nada encontrado no diário.
        </AppText>
      ) : (
        <View style={styles.results}>
          {groups.map((group) => (
            <View key={group.date} style={styles.group}>
              <AppText size={fontSize.xs} weight={800} upper tracking={0.06} color={colors.muted} accessibilityRole="header">
                {humanDate(group.date, today)}
              </AppText>
              {group.hits.map((hit) => (
                <Pressable
                  key={`${hit.kind}-${hit.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${hit.title}, ${hit.detail}, às ${hit.time}`}
                  onPress={() => {
                    setQuery("");
                    onPick(hit);
                  }}
                  style={({ pressed }) => [styles.hit, pressed && styles.hitPressed]}
                >
                  <AppText size={fontSize["2xs"]} weight={700} color={colors.muted} style={styles.time}>
                    {hit.time}
                  </AppText>
                  <View style={styles.copy}>
                    <AppText size={fontSize.sm} weight={700}>
                      {hit.title}
                    </AppText>
                    <AppText size={fontSize.xs} color={colors.muted} numberOfLines={2}>
                      {hit.detail}
                    </AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  results: { gap: 16 },
  group: { gap: 6 },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  hitPressed: { backgroundColor: colors.mint50, borderColor: colors.mint200 },
  time: { width: 40, fontVariant: ["tabular-nums"] },
  copy: { flex: 1, minWidth: 0, gap: 1 },
}));
