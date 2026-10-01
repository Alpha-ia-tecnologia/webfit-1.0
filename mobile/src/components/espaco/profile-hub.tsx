import { useRouter } from "expo-router";
import { ChevronRight, CircleAlert } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { localDate } from "@shared/lib/domain";
import {
  attentionItems,
  PROFILE_HUB_COPY,
  profileSections,
  type AttentionItem,
  type ProfileSectionCard,
} from "@shared/lib/profile-summary";
import { GROUP_ICON } from "@/components/anamnese/icons";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, IconTile } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { ProfileSectionSheet } from "./profile-section-sheet";

/** Linha de uma seção: 56 pt, como as do web dentro do mosaico. */
const ROW_MIN_HEIGHT = 56;

/** Abre o editor só daquela seção da anamnese. */
function useOpenSection() {
  const router = useRouter();
  return (index: number) => router.push({ pathname: "/anamnese", params: { secao: String(index) } });
}

/**
 * "Precisa de atenção" (ANAMNESE-X1): alergias e restrição de líquidos como "não sei" e medição antiga, em âmbar
 * (nunca vermelho), acima do mosaico do perfil de saúde.
 */
export function ProfileAttention() {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const { state } = useApp();
  const router = useRouter();
  const openSection = useOpenSection();
  const p = state.profile;
  if (!p) return null;
  const attention = attentionItems(p, localDate());
  if (!attention.length) return null;
  const tone = themeDomainTone(scheme).attention;
  const act = (item: AttentionItem) => (item.target.kind === "section" ? openSection(item.target.index) : router.push("/evolucao"));
  return (
    <View style={styles.attention} testID="profile-attention" role="group" aria-label={PROFILE_HUB_COPY.attention}>
      <View style={styles.attentionHead}>
        <CircleAlert size={17} color={tone.fg} />
        <AppText heading size={fontSize.sm} weight={700} color={tone.fg} accessibilityRole="header">
          {PROFILE_HUB_COPY.attention}
        </AppText>
      </View>
      {attention.map((item) => (
        <View key={item.key} style={styles.attentionItem}>
          <AppText size={fontSize.sm} lineHeight={20} color={colors.text2} style={styles.grow}>
            {item.text}
          </AppText>
          <Button label={item.actionLabel} accessibilityLabel={item.actionAria} variant="secondary" size="sm" onPress={() => act(item)} />
        </View>
      ))}
    </View>
  );
}

/** Uma etapa da anamnese: ícone, título e até 3 destaques; o nome acessível começa pelo título. */
function SectionRow({ card, isLast, onPress }: { card: ProfileSectionCard; isLast: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.title}. ${card.highlights.join(". ")}.`}
      {...webAttrs({ "aria-haspopup": "dialog" })}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !isLast && styles.rowDivider, pressed && styles.pressed]}
    >
      <IconTile tone={card.tone} size="md" icon={GROUP_ICON[card.icon]} />
      <View style={styles.grow}>
        <AppText heading size={fontSize.sm} weight={700} lineHeight={18}>
          {card.title}
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={16} numberOfLines={2}>
          {card.highlights.join(" · ")}
        </AppText>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

/**
 * As 7 etapas da anamnese em linhas de 56 pt (dentro da linha "Anamnese completa" do mosaico): ícone, título e até
 * 3 destaques. Tocar abre as respostas da etapa; "Revisar tudo" abre o fluxo inteiro.
 */
export function ProfileSectionList() {
  const styles = useStyles();
  const { state } = useApp();
  const router = useRouter();
  const openSection = useOpenSection();
  const [open, setOpen] = useState<number | null>(null);
  const p = state.profile;
  if (!p) return null;
  const cards = profileSections(p, state.measurements, localDate());
  return (
    <View testID="profile-hub">
      <View role="list" aria-label={PROFILE_HUB_COPY.title}>
        {cards.map((card, i) => (
          <View key={card.index} role="listitem">
            <SectionRow card={card} isLast={i === cards.length - 1} onPress={() => setOpen(card.index)} />
          </View>
        ))}
      </View>
      <Button label={PROFILE_HUB_COPY.reviewAll} variant="link" onPress={() => router.push("/anamnese")} style={styles.review} />
      {open !== null && (
        <ProfileSectionSheet
          index={open}
          onClose={() => setOpen(null)}
          onEdit={(index) => {
            setOpen(null);
            openSection(index);
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  grow: { flex: 1, minWidth: 0 },
  // Tons de atenção (âmbar), nunca rosa: o aviso orienta, não alarma.
  attention: {
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).attention.border,
    backgroundColor: themeDomainTone(scheme).attention.bg,
  },
  attentionHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  attentionItem: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  pressed: { backgroundColor: colors.surface2 },
  review: { alignSelf: "flex-start", marginHorizontal: 14, marginBottom: 4 },
}));
