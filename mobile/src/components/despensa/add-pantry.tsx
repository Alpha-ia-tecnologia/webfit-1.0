import {
  Camera,
  Images,
  Keyboard,
  ReceiptText,
  Refrigerator,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, IconTile, Notice } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows, type Domain } from "@/theme/tokens";
import { AreaAlert, AreaStatus } from "./area-status";
import { ToggleRow } from "./toggle-row";
import { BUSY_TEXT, LOCATION_OPTIONS, type PantryBusy, type PantryLocation, type PhotoMode } from "./types";

/** Altura mínima dos blocos de captura e da prévia da foto. */
const TILE_MIN_HEIGHT = 104;
const PHOTO_HEIGHT = 240;
/** Linha do "escaneando": desce e sobe em 1,6 s; com movimento reduzido, só um véu parado. */
const SCAN_MS = 1600;
const SCAN_LINE = 4;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

const MODES: { key: PhotoMode; icon: LucideIcon; tone: Domain; title: string; sub: string }[] = [
  { key: "pantry_photo", icon: Refrigerator, tone: "water", title: "Geladeira ou despensa", sub: "foto dos alimentos" },
  { key: "shopping_photo", icon: ReceiptText, tone: "food", title: "Nota de compras", sub: "lista de compras realizadas" },
];

type Props = {
  consentAi: boolean;
  aiReady: boolean;
  canAi: boolean;
  busy: PantryBusy;
  /** Erro desta área, já mascarado. */
  error: string | null;
  photoMode: PhotoMode;
  onPhotoMode: (mode: PhotoMode) => void;
  location: PantryLocation;
  onLocation: (location: PantryLocation) => void;
  photo: string;
  onAttach: (kind: "camera" | "library") => void;
  onScan: () => void;
  onCancel: () => void;
  onManual: () => void;
  onOpenEspaco: () => void;
};

/**
 * Adicionar alimentos (AGENTE-10), dentro da folha de mesmo nome (conceito 06): o que está na foto, "Digitar",
 * câmera/galeria e reconhecimento.
 */
export function AddPantry(props: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { busy, canAi, photo } = props;
  const isBusy = !!busy;
  const status = busy === "photo" || busy === "scan" ? busy : null;
  return (
    <View style={styles.root}>
      <AppText size={fontSize.sm} color={colors.muted}>
        Fotografe ou digite. Você revisa tudo antes de salvar.
      </AppText>
      <Notices {...props} />
      <ToggleRow
        label="Local inicial dos itens"
        caption="Local inicial dos itens"
        options={LOCATION_OPTIONS}
        value={props.location}
        onChange={props.onLocation}
        disabled={isBusy}
      />
      <CaptureTiles {...props} />
      <View style={styles.actions}>
        <Button label="Tirar foto" icon={Camera} variant="secondary" disabled={isBusy} onPress={() => props.onAttach("camera")} />
        <Button label="Galeria" icon={Images} variant="secondary" disabled={isBusy} onPress={() => props.onAttach("library")} />
      </View>
      {!!photo && (
        <View style={styles.scan}>
          <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" accessibilityLabel="Foto selecionada" />
          {busy === "scan" && <ScanLine />}
        </View>
      )}
      {status && <AreaStatus text={BUSY_TEXT[status]} onCancel={status === "scan" ? props.onCancel : undefined} />}
      <Button label="Reconhecer itens da foto" icon={Sparkles} disabled={!photo || !canAi} onPress={props.onScan} />
    </View>
  );
}

function Notices({ consentAi, aiReady, error, onOpenEspaco }: Props) {
  return (
    <>
      {!consentAi ? (
        <>
          <Notice>O cadastro manual funciona sem IA. Autorize o agente para reconhecer fotos e criar receitas.</Notice>
          <Button label="Abrir Meu espaço" variant="text" onPress={onOpenEspaco} />
        </>
      ) : (
        !aiReady && <Notice>O agente está desconectado. Você pode cadastrar os alimentos manualmente.</Notice>
      )}
      {error ? <AreaAlert text={error} /> : null}
    </>
  );
}

/** "O que está na foto?" (rádios) e o bloco "Digitar", na mesma linha. */
function CaptureTiles({ busy, photoMode, onPhotoMode, onManual }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isBusy = !!busy;
  return (
    <View style={styles.field}>
      <AppText size={fontSize.sm} weight={600} color={colors.text2}>
        O que está na foto?
      </AppText>
      <View style={styles.tiles}>
        <View role="radiogroup" accessibilityLabel="O que está na foto?" style={styles.radios}>
          {MODES.map((mode) => {
            const isOn = photoMode === mode.key;
            return (
              <Pressable
                key={mode.key}
                role="radio"
                accessibilityLabel={`${mode.title}, ${mode.sub}`}
                accessibilityState={{ checked: isOn, disabled: isBusy }}
                {...webAttrs({ "aria-checked": isOn })}
                disabled={isBusy}
                onPress={() => {
                  if (isOn) return;
                  selectionHaptic();
                  onPhotoMode(mode.key);
                }}
                style={({ pressed }) => [styles.tile, isOn && styles.tileOn, pressed && styles.pressed, isBusy && styles.disabled]}
              >
                <TileBody icon={mode.icon} tone={mode.tone} title={mode.title} sub={mode.sub} />
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Digitar: cadastrar item manualmente"
          accessibilityState={{ disabled: isBusy }}
          disabled={isBusy}
          onPress={onManual}
          style={({ pressed }) => [styles.tile, styles.typeTile, pressed && styles.pressed, isBusy && styles.disabled]}
        >
          <TileBody icon={Keyboard} tone="neutral" title="Digitar" sub="cadastrar item manualmente" />
        </Pressable>
      </View>
    </View>
  );
}

function TileBody({ icon, tone, title, sub }: { icon: LucideIcon; tone: Domain; title: string; sub: string }) {
  const colors = useThemeColors();
  return (
    <>
      <IconTile icon={icon} tone={tone} size="md" />
      <AppText heading size={fontSize.sm} weight={700} color={colors.text} lineHeight={17}>
        {title}
      </AppText>
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={16}>
        {sub}
      </AppText>
    </>
  );
}

/** Linha que percorre a foto enquanto o agente reconhece os itens (decorativa). */
function ScanLine() {
  const styles = useStyles();
  const isReduced = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (isReduced) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration: SCAN_MS }), -1, true);
    return () => cancelAnimation(progress);
  }, [isReduced, progress]);
  const moving = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * (PHOTO_HEIGHT - SCAN_LINE) }],
  }));
  if (isReduced) return <View {...HIDDEN} testID="pantry-scan-overlay" style={[StyleSheet.absoluteFill, styles.veil]} />;
  return <Animated.View {...HIDDEN} testID="pantry-scan-overlay" style={[styles.line, moving]} />;
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 12 },
  field: { gap: 7 },
  tiles: { flexDirection: "row", gap: 8 },
  radios: { flex: 2, flexDirection: "row", gap: 8 },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: TILE_MIN_HEIGHT,
    gap: 6,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeTile: { flex: 1 },
  tileOn: { borderColor: colors.green600, backgroundColor: colors.mint50 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scan: { height: PHOTO_HEIGHT, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface2 },
  photo: { width: "100%", height: PHOTO_HEIGHT },
  line: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCAN_LINE,
    backgroundColor: colors.green500,
    boxShadow: shadows.scanGlow,
  },
  veil: { backgroundColor: colors.mint200, opacity: 0.35 },
}));
