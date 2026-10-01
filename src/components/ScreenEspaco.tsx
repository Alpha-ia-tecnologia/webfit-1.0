import { useCallback, useEffect, useState } from "react";
import { Download, FileText, HeartPulse, SlidersHorizontal } from "lucide-react";
import { useApp } from "../lib/context";
import { SETTINGS_TAB } from "../lib/copy";
import { localDate } from "../lib/domain";
import { exportBackup, readLastBackup } from "../lib/storage";
import { ConsultaCard } from "./espaco/ConsultaCard";
import { DocumentsTab } from "./espaco/DocumentsTab";
import { HEALTH_HUB_TOGGLE_ID, HealthTab } from "./espaco/HealthTab";
import { ProfileHero } from "./espaco/ProfileHero";
import { SettingsTab } from "./espaco/SettingsTab";
import { SegmentedControl, type Segment } from "./SegmentedControl";
import { Page } from "./UI";
import "./espaco/Espaco.css";

type Tab = "perfil" | "documentos" | "preferencias";
/** Rótulo curto visível; o nome completo (acessível) contém o rótulo. */
const TABS: Segment<Tab>[] = [
  { value: "perfil", label: "Saúde", ariaLabel: "Minha saúde", icon: HeartPulse },
  {
    value: "documentos",
    label: "Exames",
    ariaLabel: "Exames e consultas",
    icon: FileText,
  },
  {
    value: "preferencias",
    label: SETTINGS_TAB.label,
    ariaLabel: SETTINGS_TAB.ariaLabel,
    icon: SlidersHorizontal,
  },
];

/**
 * Meu espaço (conceito 11): um hub "Eu". Topo com identidade e anel da anamnese, a próxima consulta
 * acima das abas (não pula ao trocar de aba) e "Exportar meus dados" como ícone no cabeçalho.
 */
export function ScreenEspaco() {
  const { state, espacoTab, clearEspacoTab } = useApp();
  // Aberto numa aba (ex.: "+ → Exame" do chat): a aba vale uma vez e o pedido é limpo. Com a tela
  // já aberta (ex.: "Ajustar em Preferências" no cartão Corpo), o pedido também troca a aba.
  const [tab, setTab] = useState<Tab>(espacoTab ?? "perfil");
  const [isHubOpen, setHubOpen] = useState(false);
  useEffect(() => {
    if (!espacoTab) return;
    setTab(espacoTab);
    clearEspacoTab();
  }, [espacoTab, clearEspacoTab]);
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const exportData = () => {
    exportBackup(state, `webfit-jornada-${localDate()}.json`);
    setLastBackup(readLastBackup());
  };
  // O chip "Anamnese 100%" abre as 7 seções no mosaico e leva o foco à linha que as recolhe.
  const openSections = useCallback(() => {
    setTab("perfil");
    setHubOpen(true);
    requestAnimationFrame(() => {
      const toggle = document.getElementById(HEALTH_HUB_TOGGLE_ID);
      toggle?.scrollIntoView({ block: "center" });
      toggle?.focus({ preventScroll: true });
    });
  }, []);
  return (
    <Page
      title="Meu espaço"
      header={{
        actions: (
          <button
            type="button"
            className="icon-btn"
            aria-label="Exportar meus dados"
            onClick={exportData}
          >
            <Download size={20} aria-hidden="true" />
          </button>
        ),
      }}
    >
      <ProfileHero onOpenSections={openSections} />
      <ConsultaCard onShowAppointments={() => setTab("documentos")} />
      <div className="espaco-tabs">
        <SegmentedControl
          label="Seções do Meu espaço"
          segments={TABS}
          value={tab}
          onChange={setTab}
          panelId="espaco-painel"
          showIcons
        />
      </div>
      <div
        id="espaco-painel"
        role="region"
        aria-label={TABS.find((t) => t.value === tab)?.ariaLabel}
        className="espaco-panel"
      >
        {tab === "perfil" && (
          <HealthTab isHubOpen={isHubOpen} onHubToggle={() => setHubOpen((open) => !open)} />
        )}
        {tab === "documentos" && <DocumentsTab />}
        {tab === "preferencias" && (
          <SettingsTab lastBackup={lastBackup} onExport={exportData} />
        )}
      </div>
    </Page>
  );
}
