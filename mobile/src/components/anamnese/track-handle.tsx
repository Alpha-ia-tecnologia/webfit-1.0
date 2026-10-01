import { useRef, useState, type ReactNode, type Ref } from "react";
import { PanResponder, Platform, View, type AccessibilityActionEvent } from "react-native";
import { makeStyles } from "@/theme/theme";

/** Caixa de toque real de 44 × 44 (o react-native-web ignora hitSlop). */
export const HANDLE_BOX = 44;
const IS_WEB = Platform.OS === "web";

type Props = {
  label: string;
  value: { min: number; max: number; now: number; text: string };
  /** Posição do centro da alça na trilha (0–100 %). */
  percent: number;
  /** Topo da caixa de toque dentro do contêiner da trilha. */
  top: number;
  /** Largura da trilha em pontos (onLayout): converte o arrasto em %. */
  trackWidth: number;
  /** Arrasto: nova posição em % da trilha. */
  onDragPercent: (percent: number) => void;
  /** Teclado do export web (setas, PageUp/PageDown, Home/End); true quando a tecla foi usada. */
  onKey: (key: string) => boolean;
  /** Ações do leitor de tela (incremento e decremento). */
  onStep: (direction: 1 | -1) => void;
  isDisabled?: boolean;
  testID?: string;
  /** Para levar o foco à alça (ex.: "Personalizar" com calorias ocultas). */
  ref?: Ref<View>;
  children: ReactNode;
};

/**
 * Alça ajustável sobre uma trilha: arrasto (PanResponder), teclado no web e ações do leitor de tela.
 * No export web vira role="slider" com aria-valuetext; a alça ativa (foco ou arrasto) fica por cima.
 */
export function TrackHandle({ label, value, percent, top, trackWidth, onDragPercent, onKey, onStep, isDisabled = false, testID, ref, children }: Props) {
  const styles = useStyles();
  const [isActive, setActive] = useState(false);
  const latest = useRef({ percent, trackWidth, onDragPercent, isDisabled });
  latest.current = { percent, trackWidth, onDragPercent, isDisabled };
  const start = useRef(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.isDisabled,
      onMoveShouldSetPanResponder: () => !latest.current.isDisabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = latest.current.percent;
        setActive(true);
      },
      onPanResponderMove: (_event, gesture) => {
        const { trackWidth: width, onDragPercent: drag } = latest.current;
        if (width > 0) drag(start.current + (gesture.dx / width) * 100);
      },
      onPanResponderRelease: () => setActive(false),
      onPanResponderTerminate: () => setActive(false),
    }),
  ).current;
  // Só no web: teclado e foco (o react-native-web repassa ao DOM).
  const webProps: object = IS_WEB
    ? {
        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
          if (!isDisabled && onKey(event.key)) event.preventDefault();
        },
        onFocus: () => setActive(true),
        onBlur: () => setActive(false),
      }
    : {};
  return (
    <View
      ref={ref}
      testID={testID}
      accessible
      focusable={!isDisabled}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      aria-valuemin={value.min}
      aria-valuemax={value.max}
      aria-valuenow={value.now}
      aria-valuetext={value.text}
      accessibilityActions={isDisabled ? undefined : [{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => onStep(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={[styles.box, { top, left: `${percent}%` as const }, isActive && styles.active]}
      {...responder.panHandlers}
      {...webProps}
    >
      {children}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: { position: "absolute", width: HANDLE_BOX, height: HANDLE_BOX, marginLeft: -HANDLE_BOX / 2, alignItems: "center", justifyContent: "center", zIndex: 1 },
  active: { zIndex: 3 },
}));
