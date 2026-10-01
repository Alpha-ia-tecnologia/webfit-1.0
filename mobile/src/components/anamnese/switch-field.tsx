import { ArrowDown, ArrowRight, Check } from "lucide-react-native";
import { useState } from "react";
import { Switch, View, useWindowDimensions } from "react-native";
import { CONSENT_DETAILS } from "@shared/data/anamneseOptions";
import type { Question } from "@shared/data/questionnaire";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { onDevice } from "./device-copy";
import { QHelp } from "./q-block";
import { TermsSheet } from "./terms-sheet";

type ConsentKey = keyof typeof CONSENT_DETAILS;
const isConsent = (key: string): key is ConsentKey => key in CONSENT_DETAILS;
// Até esta largura o caminho dos dados fica em coluna, como no .consent-flow do web.
const FLOW_COLUMN_MAX_WIDTH = 480;

type Props = {
  field: Question;
  checked: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
};

/**
 * Perguntas de sim/não como interruptor (.switch-field). Nos consentimentos, o texto integral
 * vira "Ler termos completos" e a tela mostra só pontos curtos e, na IA, o caminho dos dados
 * até os provedores.
 */
export function SwitchField({ field, checked, error, onChange }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isTermsOpen, setTermsOpen] = useState(false);
  const details = isConsent(field.key) ? CONSENT_DETAILS[field.key] : null;
  const hint = details ? undefined : field.hint;
  const label = onDevice(field.label);
  const terms = field.hint ? onDevice(field.hint) : "";
  return (
    <View style={[styles.field, checked && styles.fieldOn]}>
      <View style={styles.row}>
        <AppText size={fontSize.sm} weight={600} lineHeight={19} color={colors.text} style={styles.label}>
          {label}
        </AppText>
        <Switch
          accessibilityLabel={label}
          value={checked}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.green500 }}
          thumbColor={colors.white}
        />
      </View>
      {details?.sends && details.to ? <ConsentFlow sends={details.sends} to={details.to} /> : null}
      {details ? (
        <View style={styles.points}>
          {details.points.map((point) => (
            <View key={point} style={styles.point}>
              <View style={styles.pointIcon}>
                <Check size={14} color={colors.green700} />
              </View>
              <AppText size={fontSize.sm} lineHeight={19} color={colors.text2} style={styles.grow}>
                {onDevice(point)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      {details && terms ? (
        <Button label="Ler termos completos" variant="link" onPress={() => setTermsOpen(true)} />
      ) : null}
      <QHelp hint={hint} error={error} />
      {details && terms ? (
        <TermsSheet visible={isTermsOpen} label={label} terms={terms} onClose={() => setTermsOpen(false)} />
      ) : null}
    </View>
  );
}

/** "Pode ir" → "Para": o que pode ser enviado e a quais provedores (.consent-flow). */
function ConsentFlow({ sends, to }: { sends: string[]; to: string[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isColumn = useWindowDimensions().width <= FLOW_COLUMN_MAX_WIDTH;
  const Arrow = isColumn ? ArrowDown : ArrowRight;
  return (
    <View style={[styles.flow, isColumn && styles.flowColumn]}>
      <View style={[styles.flowPart, !isColumn && styles.grow]}>
        <AppText size={fontSize["2xs"]} weight={700} color={colors.muted}>
          Pode ir
        </AppText>
        <View style={styles.chips} role="list" aria-label="Pode ser enviado">
          {sends.map((item) => (
            <View key={item} role="listitem" style={styles.chip}>
              <AppText size={fontSize.xs} weight={600} color={colors.text2}>
                {item}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.arrow}>
        <Arrow size={18} color={colors.muted} />
      </View>
      <View style={styles.flowPart}>
        <AppText size={fontSize["2xs"]} weight={700} color={colors.muted}>
          Para
        </AppText>
        <View style={[styles.chips, !isColumn && styles.providersStacked]} role="list" aria-label="Provedores de IA">
          {to.map((item) => (
            <View key={item} role="listitem" style={[styles.chip, styles.provider]}>
              <AppText size={fontSize.xs} weight={600} color={colors.white}>
                {item}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // .switch-field
  field: { gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fieldOn: { backgroundColor: colors.mint50, borderColor: colors.mint200 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  label: { flex: 1, minWidth: 0 },
  grow: { flex: 1, minWidth: 0 },
  // .consent-flow
  flow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  flowColumn: { flexDirection: "column", alignItems: "stretch" },
  flowPart: { gap: 6, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  providersStacked: { flexDirection: "column" },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  provider: { backgroundColor: colors.navy, borderColor: "transparent" },
  arrow: { alignSelf: "center" },
  // .consent-points
  points: { gap: 6 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pointIcon: { marginTop: 3 },
}));
