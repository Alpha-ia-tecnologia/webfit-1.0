import { Plus } from "lucide-react-native";
import { View } from "react-native";
import { PHASE_SUFFIX, type CycleCardModel, type CycleTip } from "@shared/lib/cycle-tips";
import { AppText, Button, Pill, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { useCycleHabit } from "./use-cycle-habit";

const SHEET_TITLE = "Seu ciclo da semana";

/** "+ Combinado" (secundário, 44 px) ou, se já existe um com o mesmo título, a frase no lugar do botão. */
export function TipAction({ tip }: { tip: CycleTip }) {
  const colors = useThemeColors();
  const { exists, create } = useCycleHabit();
  if (exists(tip))
    return (
      <AppText size={fontSize.xs} color={colors.muted}>
        Já está nos seus combinados.
      </AppText>
    );
  return (
    <Button
      label="Combinado"
      icon={Plus}
      variant="secondary"
      size="sm"
      accessibilityLabel={`Criar combinado: ${tip.combinado.title}`}
      onPress={() => void create(tip)}
    />
  );
}

function TipLines({ tip }: { tip: CycleTip }) {
  const colors = useThemeColors();
  return (
    <>
      <AppText size={fontSize.sm} color={colors.text} lineHeight={20}>
        {tip.text}
      </AppText>
      <AppText size={fontSize.xs} color={colors.muted}>
        {`Combinado: ${tip.combinado.title} · ${tip.combinado.time}`}
      </AppText>
    </>
  );
}

type BlockProps = {
  model: CycleCardModel;
  /** Título do bloco; padrão "Seu ciclo da semana · Dias 0 a 2" (o SavedSheet usa "Para os próximos dias"). */
  heading?: string;
  /** Hoje: o título já está no botão que abre o bloco; aqui ele só nomeia o grupo. */
  showHeading?: boolean;
  onPhases: () => void;
};

/**
 * Dica da fase atual do ciclo semanal (SERINGA-11): dica local e revisada, o combinado sugerido e as
 * ações "+ Combinado" e "Ver as fases". Sem contagem regressiva, sem sequência, sem comemoração.
 */
export function CycleTipBlock({ model, heading, showHeading = true, onPhases }: BlockProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const top = model.top;
  if (!top) return null;
  const title = heading ?? `${SHEET_TITLE} · ${model.label}`;
  return (
    <View role="group" aria-label={title} style={styles.block} testID="cycle-tip">
      {showHeading && (
        <AppText size={fontSize.xs} weight={700} color={colors.text2}>
          {title}
        </AppText>
      )}
      <AppText size={fontSize.xs} color={colors.muted}>
        {model.dayLabel}
      </AppText>
      <TipLines tip={top} />
      <View style={styles.actions}>
        <TipAction tip={top} />
        <Button label="Ver as fases" variant="text" onPress={onPhases} />
      </View>
    </View>
  );
}

/** As três fases do ciclo, até 3 dicas em cada, a pílula "Agora" na atual e a nota de que são dicas gerais. */
export function CycleSheet({ model, visible, onClose }: { model: CycleCardModel | null; visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Sheet visible={visible && model !== null} title={SHEET_TITLE} onClose={onClose}>
      {model?.phases.map((view) => (
        <View key={view.phase} style={styles.section} testID="cycle-phase">
          <View style={styles.phaseHead}>
            <View style={styles.grow}>
              <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
                {view.label}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted}>
                {PHASE_SUFFIX}
              </AppText>
            </View>
            {view.isCurrent ? <Pill label="Agora" /> : null}
          </View>
          {view.tips.map((tip) => (
            <View key={tip.key} style={styles.tip}>
              <TipLines tip={tip} />
              <TipAction tip={tip} />
            </View>
          ))}
        </View>
      ))}
      {model ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          {model.note}
        </AppText>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  block: {
    gap: 4,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 },
  section: { gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  phaseHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  tip: { gap: 6, alignItems: "flex-start" },
}));
