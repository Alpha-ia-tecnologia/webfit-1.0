import { LinearGradient } from "expo-linear-gradient";
import { Camera, Images, Mic, ScanText, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { PlatePhoto } from "@shared/lib/plate-photo";
import type { FoodItem } from "@shared/types";
import { AppText, Button, Card, Notice, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, radius, shadows } from "@/theme/tokens";
import { PhotoDraft } from "./photo-draft";
import { webAttrs } from "./web-a11y";

/** Proporção da foto na linha dos atalhos (grade 2,4fr · 1fr · 1fr do web, conceito 02). */
const PHOTO_TILE_FLEX = 2.4;
/** linear-gradient(145deg, …) do web: do canto superior esquerdo ao inferior direito. */
const TILE_START = { x: 0.2, y: 0 };
const TILE_END = { x: 0.8, y: 1 };
/** Título do atalho da foto, o mesmo com ou sem foto anexada (como o rótulo do campo no web). */
const PHOTO_TITLE = "Foto do prato";
/** Atalho de ditado: "Voz" na tela; o nome acessível começa com "Descrever" (a folha é a mesma). */
const VOICE_LABEL = "Descrever por voz";

type TilesProps = {
  hasPhoto: boolean;
  aiAvailable: boolean;
  onPhoto: (source: "camera" | "library") => void;
  onLabel: () => void;
  /** "Voz" (DIARIO-07): abre a folha "Descrever refeição", com o ditado do aparelho. */
  onDescribe: () => void;
};

/**
 * Atalhos acima da busca, numa linha (CaptureTiles do web, conceito 02): foto do prato em destaque (anexada ao
 * registro; a IA separa os itens quando está disponível), voz (a folha do texto, com o ditado no aparelho) e
 * rótulo (cadastrar um alimento com os valores da embalagem). Sem código de barras: não há base de códigos na TACO.
 */
export function CaptureTiles({ hasPhoto, aiAvailable, onPhoto, onLabel, onDescribe }: TilesProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isChoosing, setChoosing] = useState(false);
  // O título visível abre o nome acessível do botão (rótulo contido no nome); a linha de baixo
  // diz o que o toque faz agora.
  const sub = hasPhoto ? "toque para trocar a foto" : aiAvailable ? "a IA separa os itens" : "fica junto do registro";
  const choose = (source: "camera" | "library") => {
    setChoosing(false);
    onPhoto(source);
  };
  return (
    <View style={styles.tiles}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${PHOTO_TITLE}, ${sub}`}
        {...webAttrs({ "aria-haspopup": "dialog" })}
        onPress={() => setChoosing(true)}
        style={({ pressed }) => [styles.tile, styles.photo, pressed && styles.pressed]}
      >
        <LinearGradient colors={gradients.photoTile} start={TILE_START} end={TILE_END} style={[StyleSheet.absoluteFill, styles.fill]} />
        <LinearGradient colors={gradients.photoGlow} start={{ x: 1, y: 0 }} end={{ x: 0.35, y: 0.7 }} style={[StyleSheet.absoluteFill, styles.fill]} />
        <View style={[styles.icon, styles.iconPhoto]}>
          <Camera size={18} color={colors.white} />
        </View>
        {aiAvailable && (
          <LinearGradient colors={gradients.brand} start={horizontal.start} end={horizontal.end} style={styles.badge}>
            <Sparkles size={13} color={colors.navy} />
            <AppText size={fontSize.xs} weight={800} color={colors.navy} lineHeight={16}>
              IA
            </AppText>
          </LinearGradient>
        )}
        <View style={styles.text}>
          <AppText heading size={fontSize.md} weight={800} color={colors.white} lineHeight={18} numberOfLines={1}>
            {PHOTO_TITLE}
          </AppText>
          <AppText size={fontSize.xs} color={colors.onFillSoft} lineHeight={16} numberOfLines={1}>
            {sub}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={VOICE_LABEL}
        {...webAttrs({ "aria-haspopup": "dialog" })}
        onPress={onDescribe}
        style={({ pressed }) => [styles.tile, styles.small, pressed && styles.pressed]}
      >
        <View style={[styles.icon, styles.iconVoice]}>
          <Mic size={18} color={colors.violet600} />
        </View>
        <AppText heading size={fontSize.sm} weight={800} lineHeight={18}>
          Voz
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Rótulo, novo alimento"
        {...webAttrs({ "aria-haspopup": "dialog" })}
        onPress={onLabel}
        style={({ pressed }) => [styles.tile, styles.small, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <ScanText size={18} color={colors.amber700} />
        </View>
        <AppText heading size={fontSize.sm} weight={800} lineHeight={18}>
          Rótulo
        </AppText>
      </Pressable>
      <Sheet visible={isChoosing} title={PHOTO_TITLE} onClose={() => setChoosing(false)}>
        <View style={styles.sources}>
          <Button label="Câmera" variant="secondary" icon={Camera} onPress={() => choose("camera")} style={styles.source} />
          <Button label="Galeria" variant="secondary" icon={Images} onPress={() => choose("library")} style={styles.source} />
        </View>
      </Sheet>
    </View>
  );
}

type PhotoProps = {
  photo: string;
  analysis: string;
  /** Itens estruturados da análise (já mascarados); sem eles, o texto de sempre. */
  draft: PlatePhoto | null;
  /** Muda a cada análise: o rascunho recomeça com as escolhas padrão. */
  draftKey: number;
  allergyDetails: string;
  canAnalyze: boolean;
  analyzing: boolean;
  aiBlocked: boolean;
  onAnalyze: () => void;
  onRemove: () => void;
  onAddFoods: (foods: FoodItem[]) => void;
  onSearch: (name: string) => void;
};

/** Foto anexada: miniatura, remover e pedir a análise ao agente (itens para conferir ou texto). */
export function PhotoCard({
  photo,
  analysis,
  draft,
  draftKey,
  allergyDetails,
  canAnalyze,
  analyzing,
  aiBlocked,
  onAnalyze,
  onRemove,
  onAddFoods,
  onSearch,
}: PhotoProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Card accessibilityLabel="Foto anexada">
      <View style={styles.photoRow}>
        <Image source={{ uri: photo }} style={styles.thumb} accessibilityLabel="Foto da refeição a registrar" />
        <View style={styles.photoActions}>
          <Button
            label={analyzing ? "Analisando…" : "Pedir análise ao agente"}
            variant="secondary"
            size="sm"
            icon={Sparkles}
            disabled={!canAnalyze}
            busy={analyzing}
            onPress={() => !analyzing && onAnalyze()}
          />
          <Button label="Remover foto" variant="text" onPress={onRemove} />
        </View>
      </View>
      {aiBlocked && (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          A análise requer conexão com o agente e sua autorização em Meu espaço.
        </AppText>
      )}
      {draft ? (
        <PhotoDraft
          key={draftKey}
          draft={draft}
          allergyDetails={allergyDetails}
          onAddFoods={onAddFoods}
          onSearch={onSearch}
        />
      ) : analysis ? (
        <Notice>
          <AppText size={fontSize.sm} lineHeight={22} color={colors.green800}>
            {analysis}
          </AppText>
          <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
            Confira os alimentos e busque cada um abaixo antes de salvar.
          </AppText>
        </Notice>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  /** Uma linha de 88 px: foto 2,4 · voz 1 · rótulo 1 (conceito 02). */
  tiles: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 88,
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  photo: { flex: PHOTO_TILE_FLEX, backgroundColor: colors.navy, boxShadow: shadows.photoTile },
  /** Voz e Rótulo: ícone e rótulo centralizados, sem linha de apoio. */
  small: { alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 6 },
  fill: { borderRadius: 22 },
  pressed: { transform: [{ scale: 0.98 }] },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amber50,
  },
  iconPhoto: { backgroundColor: colors.onFillOverlaySoft },
  iconVoice: { backgroundColor: colors.violet50 },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 24,
    paddingVertical: 2,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: radius.pill,
  },
  text: { gap: 2 },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  source: { flexGrow: 1 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: { width: 88, height: 88, borderRadius: 18 },
  photoActions: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 6 },
}));
