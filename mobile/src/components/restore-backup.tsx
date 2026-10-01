import { useState } from "react";
import { View } from "react-native";
import type { AppState } from "@shared/types";
import { localDate } from "@shared/lib/domain";
import { fmtNumber } from "@shared/lib/format";
import { inventory } from "@shared/lib/space";
import { useApp } from "@/state/app-context";
import { exportBackup } from "@/lib/last-backup";
import { pickBackup } from "@/lib/storage";
import { AppText, Button, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** Escolhe um backup, compara com o que há neste aparelho e só então substitui. */
export function RestoreBackup() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, restore, notify } = useApp();
  const [backup, setBackup] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const current = inventory(state);
  return (
    <>
      <Button
        label={busy ? "Lendo backup…" : "Restaurar backup"}
        variant="secondary"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const value = await pickBackup();
            if (value) setBackup(value);
          } catch (error) {
            notify(
              error instanceof Error
                ? error.message
                : "Não foi possível ler o backup.",
              "warning",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      <Sheet
        visible={backup !== null}
        title="Conferir backup"
        onClose={() => {
          if (!busy) setBackup(null);
        }}
      >
        <AppText weight={700}>
          {backup?.profile?.name ?? "Cadastro em andamento"}
        </AppText>
        {backup && (
          <View style={styles.table}>
            <View
              style={[styles.row, styles.head]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <AppText size={fontSize.xs} weight={700} color={colors.muted} style={styles.label}>
                Dados
              </AppText>
              <AppText size={fontSize.xs} weight={700} color={colors.muted} align="right" style={styles.count}>
                Neste aparelho
              </AppText>
              <AppText size={fontSize.xs} weight={700} color={colors.muted} align="right" style={styles.count}>
                No backup
              </AppText>
            </View>
            {inventory(backup).map((item, index) => {
              const here = fmtNumber(current[index]?.count ?? 0);
              const there = fmtNumber(item.count);
              return (
                <View
                  key={item.key}
                  style={styles.row}
                  accessible
                  accessibilityLabel={`${item.label}: ${here} neste aparelho, ${there} no backup`}
                >
                  <AppText size={fontSize.sm} weight={600} style={styles.label}>
                    {item.label}
                  </AppText>
                  <AppText size={fontSize.sm} align="right" style={[styles.count, styles.tabular]}>
                    {here}
                  </AppText>
                  <AppText size={fontSize.sm} weight={700} align="right" style={[styles.count, styles.tabular]}>
                    {there}
                  </AppText>
                </View>
              );
            })}
          </View>
        )}
        <AppText color={colors.text2}>
          Restaurar substitui os dados deste aparelho pelos dados do arquivo.
          Exporte uma cópia dos dados atuais antes de continuar se quiser
          mantê-los.
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          A autorização de IA e os lembretes ficam desativados após a
          restauração. Você pode ativá-los novamente em Meu espaço.
        </AppText>
        <Button
          label="Exportar dados atuais"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void exportBackup(
              state,
              `webfit-antes-restauracao-${localDate()}.json`,
            ).catch((error: Error) => notify(error.message, "warning"))
          }
        />
        <Button
          label={busy ? "Restaurando…" : "Substituir dados e restaurar"}
          disabled={busy}
          onPress={async () => {
            if (!backup) return;
            setBusy(true);
            try {
              if (await restore(backup, state.revision)) setBackup(null);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          label="Cancelar"
          variant="text"
          disabled={busy}
          onPress={() => setBackup(null)}
        />
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  table: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  head: { borderTopWidth: 0, backgroundColor: colors.surface2 },
  label: { flex: 1.2, minWidth: 0 },
  count: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
