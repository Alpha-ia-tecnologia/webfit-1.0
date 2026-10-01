import { Footprints, Hand, PersonStanding, RefreshCw, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { SIDES, SITES } from "@shared/lib/injection";
import type { RotationModel } from "@shared/lib/rotation";
import type { InjectionSide, InjectionSite } from "@shared/types";
import { BodyMap } from "@/components/injecao/body-map";
import { AppText, Card } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const SITE_ICONS: Record<InjectionSite, LucideIcon> = { abdomen: PersonStanding, coxa: Footprints, braco: Hand };
/** A partir desta largura do cartão, as figuras ficam à esquerda e os rádios numa coluna à direita. */
const SIDE_BY_SIDE_MIN = 290;

/** Etiqueta "Sugerido" (ou "sugerido" nas pílulas compactas da folha de confirmação). */
function SuggestedTag({ compact }: { compact: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.tag}>
      <AppText size={fontSize.xs} weight={700} color={colors.sky700}>
        {compact ? "sugerido" : "Sugerido"}
      </AppText>
    </View>
  );
}

/** Rádios "Local de aplicação" com a etiqueta "Sugerido" no próximo local do rodízio. */
export function SiteRadios({
  site,
  suggested,
  onSite,
  isColumn = false,
  compact = false,
}: {
  site: InjectionSite;
  suggested: InjectionSite;
  onSite: (site: InjectionSite) => void;
  isColumn?: boolean;
  /** Pílulas menores (folha de confirmação), com "sugerido" em minúsculas. */
  compact?: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Local de aplicação" style={[styles.radios, isColumn && styles.radiosColumn]}>
      {SITES.map((s) => {
        const Icon = SITE_ICONS[s.key];
        const isOn = s.key === site;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="radio"
            accessibilityLabel={s.label}
            accessibilityState={{ checked: isOn }}
            aria-checked={isOn}
            onPress={() => onSite(s.key)}
            style={({ pressed }) => [styles.radio, !isColumn && styles.radioFlex, isOn && styles.radioOn, pressed && styles.pressed]}
          >
            {isColumn && !compact && <Icon size={18} color={isOn ? colors.green600 : colors.faint} />}
            <AppText heading size={fontSize.sm} weight={800} color={isOn ? colors.green700 : colors.text2}>
              {s.label}
            </AppText>
            {s.key === suggested && <SuggestedTag compact={compact} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "Lado do corpo" (SERINGA-04): Esquerdo e Direito por extenso (o nome acessível é o texto à vista), com
 * "Sugerido" no oposto do último lado usado nesse local. Sem lado escolhido, nenhum rádio fica marcado.
 */
export function SideRadios({
  side,
  suggested,
  onSide,
  compact = false,
}: {
  side: InjectionSide | null;
  suggested: InjectionSide | null;
  onSide: (side: InjectionSide) => void;
  compact?: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.sideBlock}>
      {/* O grupo já se chama "Lado do corpo": o rótulo à vista não é lido duas vezes. */}
      <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <AppText size={fontSize.sm} weight={700} color={colors.text2}>
          Lado do corpo
        </AppText>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Lado do corpo" style={styles.sides}>
        {SIDES.map((s) => {
          const isOn = s.key === side;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="radio"
              accessibilityLabel={s.label}
              accessibilityState={{ checked: isOn }}
              aria-checked={isOn}
              onPress={() => onSide(s.key)}
              style={({ pressed }) => [styles.radio, styles.sideRadio, isOn && styles.radioOn, pressed && styles.pressed]}
            >
              <AppText heading size={fontSize.sm} weight={800} color={isOn ? colors.green700 : colors.text2}>
                {s.label}
              </AppText>
              {s.key === suggested && <SuggestedTag compact={compact} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type Props = {
  site: InjectionSite;
  side: InjectionSide | null;
  /** Local sugerido pelo rodízio e lado sugerido para o local escolhido. */
  suggestedSite: InjectionSite;
  suggestedSide: InjectionSide | null;
  model: RotationModel;
  onSite: (site: InjectionSite) => void;
  onSide: (side: InjectionSide) => void;
  /** "Última aplicação há 2 dias · Abdômen à esquerda." ou "Ainda não há aplicações registradas." */
  hint: string;
};

/** Local (SERINGA-04): mapa de rodízio (frente e costas, resumo visual) nos dois modos, rádios de local e de lado e a última aplicação. */
export function SiteCard({ site, side, suggestedSite, suggestedSide, model, onSite, onSide, hint }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const isSide = width >= SIDE_BY_SIDE_MIN;
  return (
    <Card>
      <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
        Local
      </AppText>
      <View style={isSide ? styles.sideRow : styles.stack} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        <BodyMap site={site} side={side} model={model} />
        <View style={isSide ? styles.controls : styles.stack}>
          <SiteRadios site={site} suggested={suggestedSite} onSite={onSite} isColumn={isSide} />
          <SideRadios side={side} suggested={suggestedSide} onSide={onSide} />
        </View>
      </View>
      <View style={styles.hint}>
        <RefreshCw size={12} color={colors.muted} />
        <AppText size={fontSize.xs} color={colors.muted} style={styles.grow}>
          {hint}
        </AppText>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  grow: { flex: 1, minWidth: 0 },
  stack: { gap: 12 },
  sideRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  controls: { flex: 1, minWidth: 0, gap: 12 },
  radios: { flexDirection: "row", gap: 8 },
  radiosColumn: { flexDirection: "column" },
  radio: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignContent: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  radioFlex: { flex: 1, minWidth: 0 },
  radioOn: { borderColor: colors.green500, backgroundColor: colors.mint50 },
  pressed: { transform: [{ scale: 0.97 }] },
  tag: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.sky100 },
  sideBlock: { gap: 6 },
  sides: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sideRadio: { flexGrow: 1, flexBasis: 88, paddingHorizontal: 8 },
  hint: { flexDirection: "row", alignItems: "center", gap: 5 },
}));
