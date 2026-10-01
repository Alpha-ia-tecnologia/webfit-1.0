import type { ReactNode, RefObject } from "react";
import { View, type ScrollView } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles } from "@/theme/theme";
import { TAB_BAR_SPACE } from "@/theme/tokens";
import { AppHeader } from "./app-header";

type HeaderProps = Parameters<typeof AppHeader>[0];

type Props = {
  header: HeaderProps;
  children: ReactNode;
  /** Ações no topo do conteúdo (.page-actions). */
  actions?: ReactNode;
  /** Sem rolagem própria (telas com lista virtualizada ou chat). */
  scroll?: boolean;
  /** Reserva espaço para a barra inferior. */
  withTabBar?: boolean;
  /** A rolagem do conteúdo (ex.: levar a tela até um cartão pedido por um atalho). */
  scrollRef?: RefObject<ScrollView | null>;
};

/** Cabeçalho + conteúdo rolável com o espaçamento do app web (.main-content, .page-content). */
export function Screen({ header, children, actions, scroll = true, withTabBar = false, scrollRef }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const bottom = (withTabBar ? TAB_BAR_SPACE : 24) + insets.bottom;
  // A rolagem do conteúdo traz o vidro do cabeçalho e, nas abas (título grande), encolhe o título.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const headerProps: HeaderProps = scroll ? { ...header, scrollY } : header;
  return (
    <View style={styles.root}>
      <AppHeader {...headerProps} />
      {scroll ? (
        <Animated.ScrollView
          ref={scrollRef as RefObject<Animated.ScrollView | null> | undefined}
          style={styles.root}
          contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {actions ? <View style={styles.actions}>{actions}</View> : null}
          {children}
        </Animated.ScrollView>
      ) : (
        <View style={[styles.root, { paddingBottom: withTabBar ? TAB_BAR_SPACE - 24 + insets.bottom : insets.bottom }]}>{children}</View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 10 },
}));
