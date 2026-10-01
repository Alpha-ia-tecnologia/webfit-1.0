import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import {
  moveHomeSection,
  parseHomeLayout,
  serializeHomeLayout,
  toggleHomeSection,
  type HomeSection,
  type HomeSectionKey,
} from "@shared/lib/home-layout";
import { AppText, Button, IconButton, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

type EditorProps = {
  unavailable: readonly HomeSectionKey[];
  onClose: () => void;
};

function SectionRow({
  section,
  isFirst,
  isLast,
  onToggle,
  onMove,
}: {
  section: HomeSection;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  // No export web o polegar ligado usaria o verde-azulado padrão do react-native-web (fora dos tokens);
  // `activeThumbColor` não está nos tipos do React Native e o aparelho o ignora.
  const webSwitch: object = { activeThumbColor: colors.white };
  return (
    <View style={styles.row} testID={`home-layout-${section.key}`}>
      <Switch
        accessibilityLabel={`Mostrar ${section.label}`}
        value={!section.isHidden}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.green500 }}
        thumbColor={colors.white}
        {...webSwitch}
      />
      <AppText
        size={fontSize.sm}
        weight={700}
        color={section.isHidden ? colors.muted : colors.text}
        style={[styles.name, section.isHidden && styles.nameHidden]}
      >
        {section.label}
      </AppText>
      <View style={styles.moves}>
        <IconButton icon={ArrowUp} iconSize={16} accessibilityLabel={`Subir ${section.label}`} disabled={isFirst} onPress={() => onMove(-1)} />
        <IconButton icon={ArrowDown} iconSize={16} accessibilityLabel={`Descer ${section.label}`} disabled={isLast} onPress={() => onMove(1)} />
      </View>
    </View>
  );
}

/** Lista editável; montada a cada abertura, começa sempre na ordem salva. */
function LayoutEditor({ unavailable, onClose }: EditorProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const [sections, setSections] = useState<HomeSection[]>(() => parseHomeLayout(state.profile?.homeLayout));
  const [isBusy, setBusy] = useState(false);
  const shown = sections.filter((s) => !unavailable.includes(s.key));
  const kept = sections.filter((s) => unavailable.includes(s.key));
  const update = (next: HomeSection[]) => setSections([...next, ...kept]);
  const save = async () => {
    const next = serializeHomeLayout(sections);
    let before: string | null = null;
    setBusy(true);
    const isSaved = await commit(
      (s) => {
        if (!s.profile) return s;
        before = s.profile.homeLayout;
        return { ...s, profile: { ...s.profile, homeLayout: next } };
      },
      "Hoje reorganizado.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) => (s.profile && before !== null ? { ...s, profile: { ...s.profile, homeLayout: before } } : s),
            "Ordem anterior restaurada.",
          ),
      },
    );
    setBusy(false);
    if (isSaved) onClose();
  };
  return (
    <View style={styles.editor}>
      <AppText size={fontSize.sm} color={colors.muted}>
        A semana, os anéis e o próximo passo ficam sempre no topo.
      </AppText>
      <View style={styles.list}>
        {shown.map((section, i) => (
          <SectionRow
            key={section.key}
            section={section}
            isFirst={i === 0}
            isLast={i === shown.length - 1}
            onToggle={() => update(toggleHomeSection(shown, section.key))}
            onMove={(delta) => update(moveHomeSection(shown, section.key, delta))}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Button label="Ordem padrão" variant="secondary" onPress={() => setSections(parseHomeLayout(""))} style={styles.action} />
        <Button label={isBusy ? "Salvando…" : "Salvar"} busy={isBusy} onPress={() => void save()} style={styles.action} />
      </View>
    </View>
  );
}

/**
 * "Editar Hoje" (HOJE-01): subir, descer e ocultar as seções abaixo dos anéis.
 * Salva em profile.homeLayout; "Desfazer" devolve a ordem anterior. Seções que não se aplicam
 * (medicação sem caneta) ficam fora da lista, guardadas no fim da ordem.
 */
export function HomeLayoutSheet({ visible, unavailable = [], onClose }: Partial<EditorProps> & { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="Editar Hoje" onClose={onClose}>
      {visible && <LayoutEditor unavailable={unavailable} onClose={onClose} />}
    </Sheet>
  );
}

/** Pílula no fim do Hoje que abre o "Editar Hoje". */
export function EditHomeButton({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Editar Hoje"
      onPress={onPress}
      style={({ pressed }) => [styles.edit, pressed && styles.editPressed]}
    >
      <SlidersHorizontal size={16} color={colors.text2} />
      <AppText size={fontSize.sm} weight={700} color={colors.text2}>
        Editar Hoje
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  editor: { gap: 16 },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  name: { flex: 1, minWidth: 0 },
  nameHidden: { textDecorationLine: "line-through" },
  moves: { flexDirection: "row", gap: 4 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  edit: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editPressed: { borderColor: colors.mint200, backgroundColor: colors.mint50 },
}));
