import { ChevronDown, Eye, ShieldCheck, Sparkles, Stethoscope, ThumbsUp, Utensils, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  describeAgentMetaFull,
  describeAgentMetaShort,
  type ProfileReport,
  type ReportSection,
  type ReportSectionKey,
} from "@shared/lib/agent-presentation";
import type { AgentMeta } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, IconTile } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";
import { QuickReplies } from "./chat-blocks";

const SECTION_ICON: Record<ReportSectionKey, LucideIcon> = {
  well: ThumbsUp,
  attention: Eye,
  suggestions: Utensils,
  talk: Stethoscope,
};

/** Uma seção do relatório: linha com tile de 32 px, título, contagem e seta; itens com ponto ou chips. */
function Section({ section, isOpen, onToggle }: { section: ReportSection; isOpen: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme)[section.tone];
  const Icon = SECTION_ICON[section.key];
  const count = section.items.length;
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${section.title}, ${count} ${count === 1 ? "item" : "itens"}`}
        accessibilityState={{ expanded: isOpen }}
        {...webAttrs({ "aria-expanded": isOpen })}
        onPress={onToggle}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <IconTile tone={section.tone} icon={Icon} style={styles.tile} />
        <AppText size={fontSize.md} weight={600} style={styles.title}>
          {section.title}
        </AppText>
        <View style={styles.count}>
          <AppText size={fontSize.xs} weight={700} color={colors.muted} style={styles.tabular}>
            {count}
          </AppText>
        </View>
        {/* A rotação vai no View, não no SVG: no export web o SVG girado some. */}
        <View style={isOpen ? styles.chevronOpen : undefined}>
          <ChevronDown size={16} color={colors.muted} />
        </View>
      </Pressable>
      {isOpen && section.key === "suggestions" ? (
        <View style={styles.chips}>
          {section.items.map((item, index) => (
            <View key={index} style={styles.chip}>
              <AppText size={fontSize.sm} weight={600} lineHeight={18} color={colors.green800}>
                {item}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      {isOpen && section.key !== "suggestions" ? (
        <View style={styles.items} role="list">
          {section.items.map((item, index) => (
            <View key={index} style={styles.item} role="listitem">
              <View style={[styles.dot, { backgroundColor: tone.fg }]} />
              <AppText size={fontSize.sm} lineHeight={19} color={colors.text2} style={styles.itemText}>
                {item}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Resposta ao "Analisar meu perfil" como cartão (ReportCard do web, conceito 05): selo "Análise do perfil" com a
 * hora, a síntese como título, as 4 seções recolhíveis (a primeira aberta) com tile de ícone, itens com ponto colorido
 * ou chips, e o rodapé com a revisão automática. Só desenha o que os blocos já limpos trazem.
 */
export function ReportCard({
  report,
  time,
  meta,
  isLatest,
  onSuggestion,
}: {
  report: ProfileReport;
  time: string;
  meta: AgentMeta | undefined;
  isLatest: boolean;
  onSuggestion: (text: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(() => report.sections.map((_, index) => index === 0));
  const toggle = (index: number) => setOpen((current) => current.map((value, i) => (i === index ? !value : value)));
  return (
    <>
      <View style={styles.card} testID="report-card" role="group" aria-label={`Análise do perfil: ${report.summary}`}>
        <View style={styles.head}>
          <View style={styles.kicker}>
            <View style={styles.badge}>
              <Sparkles size={12} color={colors.green700} />
              <AppText size={fontSize["2xs"]} weight={700} color={colors.green700}>
                Análise do perfil
              </AppText>
            </View>
            <AppText size={fontSize.xs} color={colors.muted} style={styles.tabular}>
              {`· ${time}`}
            </AppText>
          </View>
          <AppText heading size={fontSize.lg} weight={800} lineHeight={22} accessibilityRole="header">
            {report.summary}
          </AppText>
        </View>
        <View style={styles.sections}>
          {report.sections.map((section, index) => (
            <Section key={section.key} section={section} isOpen={open[index] ?? false} onToggle={() => toggle(index)} />
          ))}
        </View>
        {meta ? (
          <View style={styles.foot} accessible accessibilityLabel={describeAgentMetaFull(meta)}>
            <ShieldCheck size={14} color={colors.green700} />
            <AppText size={fontSize.xs} color={colors.muted} style={styles.shrink}>
              {describeAgentMetaShort(meta)}
            </AppText>
          </View>
        ) : null}
      </View>
      {isLatest ? <QuickReplies suggestions={report.suggestions} options={[]} onSuggestion={onSuggestion} /> : null}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, overflow: "hidden" },
  head: { gap: 8, minWidth: 0 },
  kicker: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.mint50,
  },
  tabular: { fontVariant: ["tabular-nums"] },
  sections: { minWidth: 0 },
  section: { minWidth: 0, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  /** Linha de 48 px (toque), tile de 32 px, título de 15 px, contagem e seta. */
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 6 },
  rowPressed: { opacity: 0.7 },
  tile: { width: 32, height: 32, borderRadius: 10 },
  title: { flex: 1, minWidth: 0 },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  /** Itens de 13 px alinhados ao título, com o ponto na cor do tom da seção. */
  items: { gap: 6, marginLeft: 44, marginBottom: 12 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 8, minWidth: 0 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  itemText: { flex: 1, minWidth: 0 },
  /** "Sugestões para os próximos dias": chips em menta que quebram linha. */
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: {
    maxWidth: "100%",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
  },
  foot: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  shrink: { flexShrink: 1 },
}));
