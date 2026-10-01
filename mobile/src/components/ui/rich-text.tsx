import { View } from "react-native";
import { Clock, Info, Users, Utensils } from "lucide-react-native";
import {
  parseRichText,
  type RichBlock,
  type RichInline,
  type RichSection,
} from "@shared/lib/rich-text";
import { visibleText } from "@shared/lib/text";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius } from "@/theme/tokens";
import { AppText } from "./text";

type Props = {
  text: string;
  hideCalories: boolean;
  /**
   * "Ocultar números do corpo" (ESPACO-13): peso, IMC e medidas do texto do agente viram "número oculto"
   * (textos salvos antes da preferência, como um plano que cita "72 kg").
   */
  hideBodyNumbers?: boolean;
  /** "cards" desenha cada seção com título (ex.: uma receita) como um sub-cartão. */
  variant?: "plain" | "cards";
  size?: number;
  /** Cor do texto corrido (padrão: o texto do tema); em bolhas escuras (branco) os realces seguem esta cor. */
  color?: string;
  selectable?: boolean;
  testID?: string;
};

function metaIcon(label: string) {
  if (/tempo|preparo|minuto/i.test(label)) return Clock;
  if (/rendimento|porç|serve/i.test(label)) return Users;
  if (/refeiç/i.test(label)) return Utensils;
  return Info;
}

type Ctx = { size: number; color: string; onDark: boolean; selectable: boolean };

/** Trechos dentro de um único AppText: negrito aninhado e pílula de calorias ocultas. */
function Inlines({ parts, ctx }: { parts: RichInline[]; ctx: Ctx }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "strong" ? (
          <AppText key={i} size={ctx.size} weight={700} color={ctx.color}>
            {part.text}
          </AppText>
        ) : part.kind === "hidden" ? (
          <AppText
            key={i}
            size={Math.max(fontSize.xs, ctx.size - 1)}
            weight={600}
            color={ctx.onDark ? ctx.color : colors.muted}
            style={ctx.onDark ? styles.hiddenDark : styles.hidden}
            accessibilityLabel="calorias ocultas"
          >
            {" calorias ocultas "}
          </AppText>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function Line({ parts, ctx }: { parts: RichInline[]; ctx: Ctx }) {
  return (
    <AppText
      size={ctx.size}
      lineHeight={Math.round(ctx.size * 1.6)}
      color={ctx.color}
      selectable={ctx.selectable}
    >
      <Inlines parts={parts} ctx={ctx} />
    </AppText>
  );
}

function Block({ block, ctx }: { block: RichBlock; ctx: Ctx }) {
  const styles = useStyles();
  const colors = useThemeColors();
  switch (block.kind) {
    case "heading":
      return (
        <AppText
          heading
          size={ctx.size}
          weight={700}
          color={ctx.color}
          style={styles.heading}
          selectable={ctx.selectable}
        >
          <Inlines parts={block.inlines} ctx={ctx} />
        </AppText>
      );
    case "paragraph":
      return <Line parts={block.inlines} ctx={ctx} />;
    case "bullets":
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <View style={[styles.dot, { marginTop: Math.round(ctx.size * 0.62) }]} />
              <View style={styles.itemBody}>
                <Line parts={item} ctx={ctx} />
              </View>
            </View>
          ))}
        </View>
      );
    case "steps":
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <View style={styles.stepBadge}>
                <AppText size={fontSize.xs} weight={700} color={colors.green800}>
                  {block.start + i}
                </AppText>
              </View>
              <View style={styles.itemBody}>
                <Line parts={item} ctx={ctx} />
              </View>
            </View>
          ))}
        </View>
      );
    case "meta":
      return (
        <View style={styles.meta}>
          {block.items.map((item, i) => {
            const Icon = metaIcon(item.label);
            return (
              <View key={i} style={styles.metaChip}>
                <Icon size={14} color={colors.muted} />
                <AppText size={fontSize.sm} color={colors.text2}>
                  <AppText size={fontSize.sm} color={colors.muted}>
                    {item.label}:{" "}
                  </AppText>
                  <Inlines
                    parts={item.value}
                    ctx={{ ...ctx, size: fontSize.sm, color: colors.text2, onDark: false }}
                  />
                </AppText>
              </View>
            );
          })}
        </View>
      );
  }
}

function Section({
  section,
  asCard,
  ctx,
}: {
  section: RichSection;
  asCard: boolean;
  ctx: Ctx;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const body = section.blocks.map((block, i) => <Block key={i} block={block} ctx={ctx} />);
  if (!section.title) return <>{body}</>;
  return (
    <View style={[styles.section, asCard && styles.card]}>
      <AppText
        heading
        size={ctx.size >= fontSize.base ? fontSize.lg : fontSize.md}
        weight={700}
        color={ctx.onDark ? ctx.color : colors.primary}
        selectable={ctx.selectable}
      >
        <Inlines parts={section.title} ctx={ctx} />
      </AppText>
      {body}
    </View>
  );
}

/** Texto do agente com títulos, listas, passos e metadados (mesmo parser do app web). */
export function RichText({
  text,
  hideCalories,
  hideBodyNumbers = false,
  variant = "plain",
  size = fontSize.base,
  color,
  selectable = false,
  testID,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const sections = parseRichText(visibleText(text, hideCalories, hideBodyNumbers));
  const asCard = variant === "cards" && sections.some((s) => s.title);
  const textColor = color ?? colors.text;
  const ctx: Ctx = { size, color: textColor, onDark: textColor === colors.white, selectable };
  return (
    <View style={styles.root} testID={testID}>
      {sections.map((section, i) => (
        <Section key={i} section={section} asCard={asCard} ctx={ctx} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 8 },
  section: { gap: 8 },
  card: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  heading: { marginTop: 2 },
  list: { gap: 6 },
  item: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  itemBody: { flex: 1 },
  dot: {
    width: 6,
    height: 6,
    marginLeft: 4,
    marginRight: 2,
    borderRadius: 3,
    backgroundColor: colors.emerald,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint100,
  },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  hidden: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    fontFamily: fontFamily(600),
  },
  // Escurece a bolha (branco sobre verde-700 + 18% preto ≈ 7:1); o véu claro dava ≈ 4:1.
  hiddenDark: {
    backgroundColor: colors.inkShadow,
    borderRadius: radius.pill,
    fontFamily: fontFamily(600),
  },
}));
