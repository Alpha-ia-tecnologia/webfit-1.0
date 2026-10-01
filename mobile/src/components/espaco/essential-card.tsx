import { useRouter } from "expo-router";
import { FileText, PencilLine } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ESSENTIAL_COPY, essentialSummary, type EssentialKey } from "@shared/lib/essential";
import { sectionIndexOf } from "@shared/lib/profile-summary";
import { AppText, Button, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type Domain } from "@/theme/tokens";
import { ReportSheet } from "./report-sheet";

/** Alergias em âmbar de atenção, medicamentos no tom da medicação; o resto neutro (nunca vermelho). */
const CHIP_TONE: Record<EssentialKey, Domain> = {
  alergias: "attention",
  condicoes: "neutral",
  medicamentos: "medication",
  cuidados: "neutral",
  profissionais: "neutral",
};

/**
 * "Essencial" (ESPACO-08) numa folha, aberta pelo mosaico do perfil de saúde (EssentialSheet do web): alergias,
 * condições, medicamentos (só o nome), cuidados e profissionais, para mostrar numa consulta ou emergência. A face do
 * Meu espaço nunca mostra condições nem os remédios da anamnese; aqui, só quando a pessoa abre. Sem números do corpo
 * e sem calorias.
 */
export function EssentialSheet({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tones = themeDomainTone(scheme);
  const { state } = useApp();
  const router = useRouter();
  const [isReportOpen, setReportOpen] = useState(false);
  const essential = essentialSummary(state);
  // Navegar (não abrir outra folha): fechar e ir para a anamnese no mesmo toque vale também no iOS.
  const editAnamnese = () => {
    const index = sectionIndexOf("conditions");
    onClose();
    router.push({ pathname: "/anamnese", params: { secao: String(index >= 0 ? index : 0) } });
  };
  return (
    <Sheet visible title={ESSENTIAL_COPY.title} onClose={onClose}>
      <View style={styles.body} testID="essential-card">
        <AppText size={fontSize.sm} color={colors.muted}>
          {ESSENTIAL_COPY.sub}
        </AppText>
        <AppText size={fontSize.sm} weight={600} color={colors.text2} testID="essential-summary">
          {essential.summary}
        </AppText>
        {!essential.isEmpty ? (
          <View style={styles.details} testID="essential-details">
            {essential.groups.map((group) => {
              const tone = tones[CHIP_TONE[group.key]];
              return (
                <View key={group.key} style={styles.group}>
                  <AppText size={fontSize.sm} weight={700} accessibilityRole="header">
                    {group.title}
                  </AppText>
                  <View role="list" aria-label={group.title} style={styles.chips}>
                    {group.chips.map((chip) => (
                      <View key={chip} role="listitem" style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                        <AppText size={fontSize.xs} weight={700} color={tone.fg} lineHeight={17}>
                          {chip}
                        </AppText>
                      </View>
                    ))}
                  </View>
                  {group.note ? (
                    <AppText size={fontSize.xs} color={colors.muted} lineHeight={17}>
                      {group.note}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button label={ESSENTIAL_COPY.edit} variant="text" icon={PencilLine} onPress={editAnamnese} />
          <Button label={ESSENTIAL_COPY.report} icon={FileText} hasPopup="dialog" onPress={() => setReportOpen(true)} />
        </View>
      </View>
      {isReportOpen ? <ReportSheet onClose={() => setReportOpen(false)} /> : null}
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  body: { gap: 12 },
  details: { gap: 12 },
  group: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: "100%",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
}));
