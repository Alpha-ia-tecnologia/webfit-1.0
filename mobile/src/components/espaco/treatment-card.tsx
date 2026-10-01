import { Package, Syringe } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { relativeHeights } from "@shared/lib/charts";
import { localDate } from "@shared/lib/domain";
import { fmtDayMonth } from "@shared/lib/format";
import { fmtMg } from "@shared/lib/injection";
import { treatmentModel } from "@shared/lib/treatment";
import { stockModel } from "@shared/lib/treatment-stock";
import { StockSummary } from "@/components/injecao/stock";
import { StockSheet, type StockSheetMode } from "@/components/injecao/stock-sheet";
import { AppText, Button, Card, FlatCards, Sheet, SheetNotice, useSheetNotice } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/** Altura da maior barra dos degraus (px); as outras são proporcionais, com piso de 16%. */
const BAR_MAX = 72;

type Props = {
  /** card: cartão com o título; sheet: dentro da folha "Meu tratamento" (o título é o da folha). */
  variant?: "card" | "sheet";
  /** Na folha: fecha antes de ir para a Seringa (o Modal ficaria por cima da outra tela). */
  onLeave?: () => void;
};

/**
 * "Meu tratamento" (ESPACO-X3): medicação, frequência e modo, a próxima dose estimada e os degraus de
 * dose ao longo do tempo. Sem peso nem calorias: perfis sensíveis veem o mesmo card.
 */
export function TreatmentCard({ variant = "card", onLeave }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  const { state, openInjection, notify } = useApp();
  const [stockMode, setStockMode] = useState<StockSheetMode | null>(null);
  // Na folha, o aviso do estoque (com o "Desfazer") aparece dentro dela: o da janela principal ficaria coberto.
  const sheetNotice = useSheetNotice(notify);
  const p = state.profile!;
  const today = localDate();
  const model = treatmentModel(p, state.injections, today);
  // Estoque (SERINGA-12): o que a pessoa informou e as aplicações registradas desde a abertura.
  const stock = state.treatmentStock ? stockModel(state.treatmentStock, state.injections, p, today) : null;
  const heights = relativeHeights(model.steps.map((s) => s.doseMg));
  const summary = [model.medication, model.interval, model.method].filter(Boolean).join(" · ");
  const isSheet = variant === "sheet";
  return (
    <Card testID="treatment-card">
      <View style={styles.titleRow}>
        <View style={styles.icon}>
          <Syringe size={18} color={tone.fg} />
        </View>
        {isSheet ? (
          <AppText size={fontSize.sm} weight={600} color={colors.text2} style={styles.grow}>
            {summary}
          </AppText>
        ) : (
          <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
            Meu tratamento
          </AppText>
        )}
      </View>
      {isSheet ? null : (
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          {summary}
        </AppText>
      )}
      {model.nextLine && (
        <AppText size={fontSize.sm} color={colors.text2}>
          {model.nextLine}
        </AppText>
      )}
      <AppText heading size={fontSize.base} weight={800} accessibilityRole="header">
        Degraus de dose
      </AppText>
      {model.steps.length ? (
        <View style={styles.steps} accessibilityRole="image" accessibilityLabel={model.stepsAria} testID="dose-steps">
          {model.steps.map((step, i) => (
            <View key={`${step.from}-${i}`} style={styles.step}>
              <View style={styles.track}>
                <AppText size={fontSize.xs} weight={800} color={colors.text} align="center">
                  {fmtMg(step.doseMg)}
                </AppText>
                <View style={[styles.bar, { height: (BAR_MAX * (heights[i] ?? 0)) / 100 }]} />
              </View>
              <AppText size={fontSize.xs} color={colors.muted} align="center" lineHeight={16}>
                desde {fmtDayMonth(step.from)} · {step.count}×
              </AppText>
            </View>
          ))}
        </View>
      ) : (
        <AppText size={fontSize.sm} color={colors.muted}>
          Seus degraus aparecem depois do primeiro registro.
        </AppText>
      )}
      <AppText heading size={fontSize.base} weight={800} accessibilityRole="header">
        Estoque
      </AppText>
      {stock ? (
        <StockSummary model={stock} onEdit={() => setStockMode("edit")} onNew={() => setStockMode("new")} />
      ) : (
        <Button label="Informar estoque do frasco ou caneta" variant="link" icon={Package} onPress={() => setStockMode("create")} style={styles.start} />
      )}
      {isSheet ? <SheetNotice notice={sheetNotice.notice} onDismiss={sheetNotice.clear} /> : null}
      <Button
        label="Abrir Seringa e dose"
        variant="link"
        icon={Syringe}
        onPress={() => {
          onLeave?.();
          openInjection(null);
        }}
      />
      <StockSheet mode={stockMode} onClose={() => setStockMode(null)} say={isSheet ? sheetNotice.showLocal : undefined} />
    </Card>
  );
}

/** "Meu tratamento" numa folha, aberta pela linha Medicação do mosaico do perfil de saúde (TreatmentSheet do web). */
export function TreatmentSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet visible title="Meu tratamento" onClose={onClose}>
      <FlatCards>
        <TreatmentCard variant="sheet" onLeave={onClose} />
      </FlatCards>
    </Sheet>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  start: { alignSelf: "flex-start" },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: themeDomainTone(scheme).medication.bg, alignItems: "center", justifyContent: "center" },
  steps: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  step: { flex: 1, minWidth: 0, alignItems: "center", gap: 4 },
  /** Rótulo em mg logo acima de cada barra; a trilha reserva a barra mais alta e o rótulo. */
  track: { height: BAR_MAX + 22, width: "100%", justifyContent: "flex-end", alignItems: "center", gap: 4 },
  bar: { width: "70%", maxWidth: 36, borderRadius: radius.xs, backgroundColor: themeDomainTone(scheme).medication.fg },
}));
