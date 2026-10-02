import { useState } from "react";
import {
  Bell,
  Bot,
  Clock,
  Download,
  Droplets,
  EyeOff,
  HardDrive,
  MessageCircle,
  Moon,
  Ruler,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  SunMoon,
  Target,
} from "lucide-react";
import { BODY_PRIVACY_COPY } from "../../lib/body-privacy";
import { useApp } from "../../lib/context";
import { fmtNumber } from "../../lib/format";
import { sectionIndexOf } from "../../lib/profile-summary";
import {
  agentStatus,
  backupStatus,
  fmtInterval,
  inventory,
  quietLabel,
  withProfilePatch,
} from "../../lib/space";
import { THEME_COPY } from "../../lib/theme";
import { IconTile } from "../IconTile";
import { RestoreBackup } from "../RestoreBackup";
import { Card, Field, Modal } from "../UI";
import { useThemePref } from "../useThemePref";
import { AppearanceSheet } from "./AppearanceSheet";
import { AccountCard } from "./AccountCard";
import { ServerSyncCard } from "./ServerSyncCard";
import { SwitchRow, ValueRow } from "./SettingRow";
import { HydrationSheet, QuietHoursSheet } from "./SettingSheets";
import "./Settings.css";

type ProfileSwitchKey =
  | "hideCalories"
  | "hideBodyNumbers"
  | "remindersEnabled"
  | "consentAi";
/** Preferências guardadas no estado do app (não no perfil): ajuste dinâmico e comentário diário da IA. */
type StateSwitchKey = "adaptiveTargets" | "aiDailyComment";
type SwitchKey = ProfileSwitchKey | StateSwitchKey;
const isStateKey = (key: SwitchKey): key is StateSwitchKey =>
  key === "adaptiveTargets" || key === "aiDailyComment";
const IN_ANAMNESE = "Na anamnese";

/** Aba "Preferências e dados": escolhas em lista, o agente, onde ficam os dados, backup e exclusão. */
export function SettingsTab({
  lastBackup,
  onExport,
}: {
  lastBackup: string | null;
  onExport: () => void;
}) {
  const {
    state,
    commit,
    notify,
    reset,
    cancelAi,
    aiReady,
    aiProviders,
    openAnamneseSection,
    account,
  } = useApp();
  const p = state.profile!;
  const [pending, setPending] = useState<Partial<Record<SwitchKey, boolean>>>(
    {},
  );
  const [sheet, setSheet] = useState<"quiet" | "water" | "appearance" | null>(
    null,
  );
  const [themePref] = useThemePref();
  const [deleting, setDeleting] = useState(false),
    [deleteText, setDeleteText] = useState(""),
    [busy, setBusy] = useState(false);
  const backup = backupStatus(lastBackup);
  const status = agentStatus(aiReady, pending.consentAi ?? p.consentAi, aiProviders);
  // Otimista: o interruptor muda na hora e fica travado até a gravação terminar.
  const change = async (key: SwitchKey, value: boolean) => {
    setPending((current) => ({ ...current, [key]: value }));
    if (key === "consentAi" && !value) cancelAi();
    await commit(
      (s) =>
        isStateKey(key)
          ? { ...s, [key]: value }
          : withProfilePatch(s, { [key]: value }),
      "Preferência salva.",
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tira a chave do objeto; só o resto importa
    setPending(({ [key]: _done, ...rest }) => rest);
  };
  const switchProps = (key: SwitchKey) => ({
    id: `setting-${key}`,
    checked: pending[key] ?? (isStateKey(key) ? state[key] : p[key]),
    disabled: pending[key] !== undefined,
    onChange: (value: boolean) => void change(key, value),
  });
  const openSection = (anchor: string) => {
    const index = sectionIndexOf(anchor);
    openAnamneseSection(index >= 0 ? index : 0);
  };
  return (
    <>
      <Card className="settings-card">
        <h2>Suas escolhas</h2>
        <ul className="set-group">
          <SwitchRow
            {...switchProps("hideCalories")}
            icon={EyeOff}
            label="Ocultar calorias nas telas e respostas"
          />
          <SwitchRow
            {...switchProps("hideBodyNumbers")}
            icon={Ruler}
            tone="body"
            label={BODY_PRIVACY_COPY.switchLabel}
          />
          <SwitchRow
            {...switchProps("remindersEnabled")}
            icon={Bell}
            tone="habit"
            label="Lembretes dentro da plataforma"
          />
          <ValueRow
            icon={Moon}
            tone="mind"
            label="Horário de silêncio"
            value={quietLabel(p)}
            opensDialog
            onClick={() => setSheet("quiet")}
          />
          <ValueRow
            icon={Droplets}
            tone="water"
            label="Lembretes de água"
            value={fmtInterval(p.hydrationInterval)}
            opensDialog
            onClick={() => setSheet("water")}
          />
          <ValueRow
            icon={Target}
            tone="food"
            label="Metas de alimentação"
            value={IN_ANAMNESE}
            onClick={() => openSection("manualCalories")}
          />
          <SwitchRow
            {...switchProps("adaptiveTargets")}
            icon={SlidersHorizontal}
            tone="food"
            label="Ajuste dinâmico das metas"
          />
          <ValueRow
            icon={Clock}
            tone="food"
            label="Horários das refeições"
            value={IN_ANAMNESE}
            onClick={() => openSection("breakfastTime")}
          />
          <ValueRow
            icon={SunMoon}
            tone="neutral"
            label={THEME_COPY.row}
            value={THEME_COPY.options[themePref]}
            opensDialog
            onClick={() => setSheet("appearance")}
          />
        </ul>
      </Card>
      <Card className="settings-card">
        <h2>Agente e IA</h2>
        <ul className="set-group">
          <SwitchRow
            {...switchProps("consentAi")}
            icon={Sparkles}
            tone="mind"
            label="Permitir envio do contexto ao DeepSeek e/ou à OpenAI ao usar IA"
          />
          <SwitchRow
            {...switchProps("aiDailyComment")}
            icon={MessageCircle}
            tone="mind"
            label="Comentários automáticos da IA"
          />
          <li className="set-row is-status">
            <IconTile tone="neutral" size="md" icon={Bot} className="set-icon" />
            <span className="set-label">Agente</span>
            <span className={`set-status ${status.tone}`}>{status.label}</span>
          </li>
        </ul>
      </Card>
      {sheet === "quiet" && <QuietHoursSheet onClose={() => setSheet(null)} />}
      {sheet === "water" && <HydrationSheet onClose={() => setSheet(null)} />}
      {sheet === "appearance" && (
        <AppearanceSheet onClose={() => setSheet(null)} />
      )}
      {account && <AccountCard account={account} />}
      <ServerSyncCard />
      <Card className="data-card">
        <h2>Onde ficam meus dados?</h2>
        <ul className="privacy-lines">
          <li>
            <HardDrive size={18} aria-hidden="true" />
            {account
              ? "Ficam neste navegador e na sua conta deste servidor. Ao sair da conta, saem do navegador."
              : state.serverSync
                ? "Ficam neste navegador e numa cópia no banco de dados do servidor, que você pode desligar."
                : "Tudo fica neste navegador: sem conta, sem nuvem."}
          </li>
          <li>
            <Sparkles size={18} aria-hidden="true" />A IA só recebe seu contexto
            quando você autoriza e pede uma resposta.
          </li>
          <li>
            <Download size={18} aria-hidden="true" />
            Exporte um backup para não perder o histórico.
          </li>
        </ul>
        <p className={`backup-status ${backup.tone}`}>
          <ShieldCheck size={16} aria-hidden="true" />
          {backup.label}
        </p>
        <dl className="inventory-grid">
          {inventory(state).map((item) => (
            <div key={item.key}>
              <dt>{item.label}</dt>
              <dd>{fmtNumber(item.count)}</dd>
            </div>
          ))}
        </dl>
        <div className="data-actions">
          <button className="btn-secondary" onClick={onExport}>
            <Download size={17} />
            Exportar backup
          </button>
          <RestoreBackup />
        </div>
        <details className="data-more">
          <summary>Saiba mais sobre seus dados</summary>
          <p>
            O acesso a este perfil do navegador dá acesso aos seus dados.
            Limpar os dados do site ou usar uma sessão temporária pode apagar
            seu histórico.
          </p>
          <p>
            Ao usar a IA com sua autorização, o contexto da anamnese, registros
            recentes e arquivos escolhidos são enviados ao DeepSeek e/ou à
            OpenAI, conforme a configuração. Uma falha pode encaminhar a
            solicitação ao provedor de reserva. O servidor local encaminha a
            solicitação e não grava seu conteúdo. O serviço externo aplica suas
            próprias condições de tratamento de dados.
          </p>
          <p>
            O arquivo exportado contém os dados e anexos, sem proteção por
            senha. Guarde-o em um local de sua confiança.
          </p>
        </details>
      </Card>
      <Card className="danger-card">
        <h2>Apagar dados</h2>
        <p className="hint">
          Remove tudo deste navegador
          {state.serverSync ? " e a cópia no servidor" : ""}. Não apaga backups
          exportados nem o que já foi enviado à IA.
        </p>
        <button className="text-btn danger" onClick={() => setDeleting(true)}>
          Excluir todos os meus dados
        </button>
      </Card>
      {deleting && (
        <Modal
          title="Excluir todos os dados locais"
          onClose={() => setDeleting(false)}
        >
          <p>
            Esta ação apaga sua anamnese, diário, medidas, combinados, conversas,
            exames e consultas deste navegador
            {state.serverSync ? ", e também a cópia no servidor" : ""}. Ela não
            apaga cópias exportadas nem dados já enviados ao provedor de IA.
          </p>
          <Field label="Digite EXCLUIR para confirmar">
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
            />
          </Field>
          <button
            className="btn btn-danger"
            disabled={deleteText !== "EXCLUIR" || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await reset();
              } catch (error) {
                notify((error as Error).message, "warning");
              } finally {
                // Sem conseguir apagar a cópia no servidor, nada é excluído e o botão volta.
                setBusy(false);
              }
            }}
          >
            Excluir e recomeçar
          </button>
        </Modal>
      )}
    </>
  );
}
