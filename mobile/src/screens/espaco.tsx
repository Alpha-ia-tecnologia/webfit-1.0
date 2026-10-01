import { useLocalSearchParams } from "expo-router";
import { Download, FileText, HeartPulse, SlidersHorizontal } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Platform, View, type LayoutChangeEvent, type ScrollView } from "react-native";
import { SETTINGS_TAB } from "@shared/lib/copy";
import { localDate } from "@shared/lib/domain";
import { ConsultaCard } from "@/components/espaco/consulta-card";
import { DocumentsTab } from "@/components/espaco/documents-tab";
import { HealthTab } from "@/components/espaco/health-tab";
import { ProfileHero } from "@/components/espaco/profile-hero";
import { SettingsTab } from "@/components/espaco/settings-tab";
import { Screen } from "@/components/layout/screen";
import { IconButton, SegmentedControl, type Segment } from "@/components/ui";
import { isEspacoLinkTab } from "@/lib/espaco-link";
import { focusNode } from "@/lib/focus";
import { exportBackup, useLastBackup } from "@/lib/last-backup";
import { useTimeouts } from "@/lib/timeouts";
import { useApp } from "@/state/app-context";
import { makeStyles } from "@/theme/theme";

type Tab = "perfil" | "documentos" | "preferencias";
/** Rótulo curto visível; o nome acessível completo contém o rótulo. */
const TABS: readonly Segment<Tab>[] = [
  { value: "perfil", label: "Saúde", accessibilityLabel: "Minha saúde", icon: HeartPulse },
  {
    value: "documentos",
    label: "Exames",
    accessibilityLabel: "Exames e consultas",
    icon: FileText,
  },
  {
    value: "preferencias",
    label: SETTINGS_TAB.label,
    accessibilityLabel: SETTINGS_TAB.ariaLabel,
    icon: SlidersHorizontal,
  },
];
/** Espera a aba "Saúde" e a lista das seções montarem antes de medir a linha "Anamnese completa". */
const OPEN_SECTIONS_MS = 250;
/** Folga acima da linha ao rolar até ela (o cabeçalho de vidro fica por cima do topo do conteúdo). */
const SCROLL_MARGIN = 120;

/**
 * Meu espaço (conceito 11; ScreenEspaco do web): um hub "Eu". Topo com identidade e anel da anamnese, a próxima
 * consulta acima das abas (não pula ao trocar de aba) e "Exportar meus dados" como ícone no cabeçalho.
 */
export function EspacoScreen() {
  const styles = useStyles();
  const { state, notify } = useApp();
  const { tab: requestedTab, pedido } = useLocalSearchParams<{ tab?: string; pedido?: string }>();
  // Atalhos de outras telas abrem uma aba: preferências (conexão) ou exames ("+ → Exame" do chat).
  // `pedido` muda a cada atalho (espacoHref): o mesmo ?tab de antes troca a aba de novo, mesmo que a
  // pessoa tenha mudado de aba à mão com a tela montada.
  const [tab, setTab] = useState<Tab>(isEspacoLinkTab(requestedTab) ? requestedTab : "perfil");
  const [isHubOpen, setHubOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const panelRef = useRef<View>(null);
  const panelY = useRef(0);
  const hubToggleRef = useRef<View>(null);
  const later = useTimeouts();
  useEffect(() => {
    if (isEspacoLinkTab(requestedTab)) setTab(requestedTab);
  }, [requestedTab, pedido]);
  const lastBackup = useLastBackup();
  const exportData = () =>
    void exportBackup(state, `webfit-jornada-${localDate()}.json`).catch((e: Error) => notify(e.message, "warning"));
  // O chip "Anamnese 100%" abre as 7 seções no mosaico e leva a tela (e o foco) até a linha que as recolhe.
  const openSections = () => {
    setTab("perfil");
    setHubOpen(true);
    later(() => {
      const toggle = hubToggleRef.current;
      const panel = panelRef.current;
      if (!toggle || !panel) return;
      toggle.measureLayout(panel, (_x, y) =>
        scrollRef.current?.scrollTo({ y: Math.max(0, panelY.current + y - SCROLL_MARGIN), animated: Platform.OS !== "web" }),
      );
      focusNode(toggle);
    }, OPEN_SECTIONS_MS);
  };

  return (
    <Screen
      header={{
        variant: "large",
        title: "Meu espaço",
        actions: <IconButton icon={Download} variant="header" accessibilityLabel="Exportar meus dados" onPress={exportData} />,
      }}
      withTabBar
      scrollRef={scrollRef}
    >
      <ProfileHero onOpenSections={openSections} />
      <ConsultaCard onShowAppointments={() => setTab("documentos")} />
      <SegmentedControl label="Seções do Meu espaço" segments={TABS} value={tab} onChange={setTab} showIcons />
      <View
        ref={panelRef}
        style={styles.panel}
        onLayout={(e: LayoutChangeEvent) => {
          panelY.current = e.nativeEvent.layout.y;
        }}
      >
        {tab === "perfil" && (
          <HealthTab
            onOpenPreferences={() => setTab("preferencias")}
            isHubOpen={isHubOpen}
            onHubToggle={() => setHubOpen((open) => !open)}
            hubToggleRef={hubToggleRef}
          />
        )}
        {tab === "documentos" && <DocumentsTab />}
        {tab === "preferencias" && <SettingsTab lastBackup={lastBackup} onExport={exportData} />}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  // As seções da aba mantêm o espaçamento do conteúdo da tela (o gap de 14 do Screen).
  panel: { gap: 14 },
}));
