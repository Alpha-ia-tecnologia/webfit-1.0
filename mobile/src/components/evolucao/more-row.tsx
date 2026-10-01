import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, IconTile } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, type Domain } from "@/theme/tokens";

type Props = {
  icon: LucideIcon;
  tone: Domain;
  title: string;
  value?: string | null;
  onPress: () => void;
  /** Nome acessível próprio (padrão: o título e o valor). */
  accessibilityLabel?: string;
  /** Abre uma folha (aria-haspopup no web). */
  isDialog?: boolean;
  isLast?: boolean;
  testID?: string;
};

/** Linha de 56 pt de "Mais da sua evolução": ícone no tom do domínio, título, valor curto e a seta. */
export function MoreRow({ icon, tone, title, value, onPress, accessibilityLabel, isDialog = true, isLast = false, testID }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="listitem" testID={testID} style={[styles.item, isLast && styles.last]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
        {...(isDialog ? webAttrs({ "aria-haspopup": "dialog" }) : {})}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <IconTile icon={icon} tone={tone} size="md" />
        <View style={styles.text}>
          <AppText heading size={fontSize.md} weight={700} numberOfLines={1}>
            {title}
          </AppText>
          {value ? (
            <AppText size={fontSize.sm} color={colors.muted} numberOfLines={1}>
              {value}
            </AppText>
          ) : null}
        </View>
        <View aria-hidden>
          <ChevronRight size={20} color={colors.muted} />
        </View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  item: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  last: { borderBottomWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0, gap: 1 },
}));
