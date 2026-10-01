import { useRouter } from "expo-router";
import {
  Bell,
  Bot,
  Clock,
  Download,
  Droplets,
  EyeOff,
  HardDrive,
  Moon,
  Ruler,
  ShieldCheck,
  Sparkles,
  SunMoon,
  Target,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { fmtNumber } from "@shared/lib/format";
import { sectionIndexOf } from "@shared/lib/profile-summary";
import {
  agentStatus,
  backupStatus,
  fmtInterval,
  inventory,
  quietLabel,
  withProfilePatch,
  type InventoryItem,
} from "@shared/lib/space";
import { THEME_COPY } from "@shared/lib/theme";
import { RestoreBackup } from "@/components/restore-backup";
import { AppText, Button, Card, Disclosure, Field, Sheet, TextField } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, RN_DARK_MODE_ENABLED, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type ColorScheme, type ThemeColors } from "@/theme/tokens";
import { AppearanceSheet } from "./appearance-sheet";
import { ServerCard } from "./server-card";
import { AccountCard } from "./account-card";
import { ServerSyncCard } from "./server-sync-card";
import { SettingGroup, StatusRow, SwitchRow, ValueRow } from "./setting-row";
import { HydrationSheet, QuietHoursSheet } from "./setting-sheets";

type SwitchKey = "hideCalories" | "hideBodyNumbers" | "remindersEnabled" | "consentAi";
const CHOICES: [SwitchKey, LucideIcon, string][] = [
  ["hideCalories", EyeOff, "Ocultar calorias nas telas e respostas"],
  ["hideBodyNumbers", Ruler, BODY_PRIVACY_COPY.switchLabel],
  ["remindersEnabled", Bell, "Lembretes dentro do aplicativo"],
];
const AI_LABEL = "Permitir envio do contexto ao DeepSeek e/ou à OpenAI ao usar IA";
const privacyLines = (serverSync: boolean, hasAccount: boolean): [LucideIcon, string][] => [
  [
    HardDrive,
    hasAccount
      ? "Ficam neste aparelho e na sua conta deste servidor. Ao sair da conta, saem do aparelho."
      : serverSync
        ? "Ficam neste aparelho e numa cópia no banco de dados do servidor, que você pode desligar."
        : "Tudo fica neste aparelho: sem conta, sem nuvem.",
  ],
  [Sparkles, "A IA só recebe seu contexto quando você autoriza e pede uma resposta."],
  [Download, "Exporte um backup para não perder o histórico."],
];
function backupTones(colors: ThemeColors, scheme: ColorScheme): Record<"ok" | "attention", { fg: string; bg: string }> {
  const attention = themeDomainTone(scheme).attention;
  return {
    ok: { fg: colors.green800, bg: colors.mint50 },
    attention: { fg: attention.fg, bg: attention.bg },
  };
}
/** Até esta largura o inventário fica em 2 colunas (como o web até 420 px). */
const NARROW_WIDTH = 420;
const IN_ANAMNESE = "Na anamnese";

/** Aba "Ajustes" (nome acessível "Ajustes e dados", SETTINGS_TAB): escolhas em lista, agente e IA, onde ficam os dados, backup e exclusão. */
export function SettingsTab({
  lastBackup,
  onExport,
}: {
  /** undefined enquanto a data é lida. */
  lastBackup: string | null | undefined;
  onExport: () => void;
}) {
  const styles = useStyles();
  const { scheme, colors, pref: themePref } = useTheme();
  const backupTone = backupTones(colors, scheme);
  const { state, commit, notify, reset, cancelAi, aiReady, aiProviders, account } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const p = state.profile!;
  const [pending, setPending] = useState<Partial<Record<SwitchKey, boolean>>>({});
  const [sheet, setSheet] = useState<"quiet" | "water" | "appearance" | null>(null);
  const [isDeleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [busy, setBusy] = useState(false);
  const columns = width > NARROW_WIDTH ? 3 : 2;
  const items = inventory(state);
  const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, i) =>
    items.slice(i * columns, i * columns + columns),
  );
  const backup = lastBackup === undefined ? null : backupStatus(lastBackup);
  const status = agentStatus(aiReady, p.consentAi, aiProviders);

  const change = async (key: SwitchKey, value: boolean) => {
    setPending((current) => ({ ...current, [key]: value }));
    if (key === "consentAi" && !value) cancelAi();
    await commit((s) => withProfilePatch(s, { [key]: value }), "Preferência salva.");
    setPending(({ [key]: _done, ...rest }) => rest);
  };
  const switchRow = (key: SwitchKey, icon: LucideIcon, label: string) => (
    <SwitchRow
      key={key}
      icon={icon}
      label={label}
      value={pending[key] ?? p[key]}
      disabled={pending[key] !== undefined}
      onChange={(value) => void change(key, value)}
    />
  );
  const openSection = (anchor: string) =>
    router.push({ pathname: "/anamnese", params: { secao: String(sectionIndexOf(anchor)) } });
  const deleteAll = async () => {
    setBusy(true);
    try {
      setDeleting(false);
      await reset();
    } catch (e) {
      notify((e as Error).message, "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Suas escolhas
        </AppText>
        <SettingGroup>
          {CHOICES.map(([key, icon, label]) => switchRow(key, icon, label))}
          <ValueRow icon={Moon} label="Horário de silêncio" value={quietLabel(p)} onPress={() => setSheet("quiet")} />
          <ValueRow
            icon={Droplets}
            label="Lembretes de água"
            value={fmtInterval(p.hydrationInterval)}
            onPress={() => setSheet("water")}
          />
          <ValueRow
            icon={Target}
            label="Metas de alimentação"
            value={IN_ANAMNESE}
            opensSheet={false}
            onPress={() => openSection("manualCalories")}
          />
          <ValueRow
            icon={Clock}
            label="Horários das refeições"
            value={IN_ANAMNESE}
            opensSheet={false}
            onPress={() => openSection("breakfastTime")}
          />
          {/* Tema claro/escuro (HOJE-X2): só com o tema escuro ligado; até lá o app é sempre claro. */}
          {RN_DARK_MODE_ENABLED && (
            <ValueRow
              icon={SunMoon}
              label={THEME_COPY.row}
              value={THEME_COPY.options[themePref]}
              onPress={() => setSheet("appearance")}
            />
          )}
        </SettingGroup>
      </Card>
      <Card>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Agente e IA
        </AppText>
        <SettingGroup>
          {switchRow("consentAi", Sparkles, AI_LABEL)}
          <StatusRow icon={Bot} label="Agente" status={status.label} tone={status.tone} />
        </SettingGroup>
        {/* Recolhido quando conectado; abre sozinho sem conexão (a chave remonta ao mudar). */}
        <Disclosure key={aiReady ? "ready" : "offline"} title="Avançado: servidor do agente" defaultOpen={!aiReady}>
          <ServerCard embedded />
        </Disclosure>
      </Card>
      {account && <AccountCard account={account} />}
      <ServerSyncCard />
      <Card style={styles.dataCard}>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Onde ficam meus dados?
        </AppText>
        <View style={styles.lines}>
          {privacyLines(state.serverSync, !!account).map(([Icon, text]) => (
            <View key={text} style={styles.line}>
              <View style={styles.lineIcon}>
                <Icon size={18} color={colors.green700} />
              </View>
              <AppText color={colors.text2} style={styles.grow}>
                {text}
              </AppText>
            </View>
          ))}
        </View>
        {backup && (
          <View
            style={[styles.backup, { backgroundColor: backupTone[backup.tone].bg }]}
            accessible
            accessibilityLabel={backup.label}
          >
            <ShieldCheck size={16} color={backupTone[backup.tone].fg} />
            <AppText size={fontSize.sm} weight={600} color={backupTone[backup.tone].fg}>
              {backup.label}
            </AppText>
          </View>
        )}
        <View style={styles.inventory}>
          {rows.map((row) => (
            <View key={row.map((item) => item.key).join("-")} style={styles.inventoryRow}>
              {row.map((item) => (
                <InventoryTile key={item.key} item={item} />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.dataActions}>
          <Button label="Exportar backup" variant="secondary" icon={Download} onPress={onExport} />
          <RestoreBackup />
        </View>
        <Disclosure title="Saiba mais sobre seus dados">
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
            As respostas, mensagens, registros e arquivos ficam no armazenamento deste aparelho.
            Não há conta nem sincronização entre dispositivos; a cópia no servidor só existe se
            você ligá-la acima.
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
            Desinstalar o aplicativo ou limpar seus dados apaga o histórico. Exporte uma cópia
            quando precisar preservá-lo.
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
            Ao usar a IA com sua autorização, o contexto da anamnese, registros recentes e arquivos
            escolhidos são enviados ao DeepSeek e/ou à OpenAI, conforme a configuração, inclusive
            ao provedor de reserva em caso de falha, por meio do servidor do WebFit, que encaminha
            a solicitação e não grava seu conteúdo.
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
            O arquivo exportado contém os dados e anexos, sem proteção por senha. Guarde-o em um
            local de sua confiança.
          </AppText>
        </Disclosure>
      </Card>
      <Card style={styles.dangerCard}>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Apagar dados
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          Remove tudo deste aparelho{state.serverSync ? " e a cópia no servidor" : ""}. Não apaga
          backups exportados nem o que já foi enviado à IA.
        </AppText>
        <Button
          label="Excluir todos os meus dados"
          variant="text"
          tone="danger"
          onPress={() => setDeleting(true)}
        />
      </Card>

      {sheet === "quiet" && <QuietHoursSheet onClose={() => setSheet(null)} />}
      {sheet === "water" && <HydrationSheet onClose={() => setSheet(null)} />}
      {RN_DARK_MODE_ENABLED && sheet === "appearance" && <AppearanceSheet onClose={() => setSheet(null)} />}
      <Sheet
        visible={isDeleting}
        title="Excluir todos os dados locais"
        onClose={() => setDeleting(false)}
        footer={
          <Button
            label="Excluir e recomeçar"
            variant="danger"
            wide
            disabled={deleteText !== "EXCLUIR" || busy}
            onPress={() => void deleteAll()}
          />
        }
      >
        <AppText color={colors.text2} lineHeight={21}>
          Esta ação apaga sua anamnese, diário, medidas, combinados, conversas, exames e consultas
          deste aparelho{state.serverSync ? ", e também a cópia no servidor" : ""}. Ela não apaga
          cópias exportadas nem dados já enviados ao provedor de IA.
        </AppText>
        <Field label="Digite EXCLUIR para confirmar">
          <TextField
            value={deleteText}
            onChangeText={setDeleteText}
            autoCapitalize="characters"
            accessibilityLabel="Digite EXCLUIR para confirmar"
          />
        </Field>
      </Sheet>
    </>
  );
}

function InventoryTile({ item }: { item: InventoryItem }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={`${item.label}: ${fmtNumber(item.count)}`}
    >
      <AppText size={fontSize.xs} color={colors.muted} numberOfLines={1}>
        {item.label}
      </AppText>
      <AppText heading size={fontSize.lg} weight={700} style={styles.tabular}>
        {fmtNumber(item.count)}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  grow: { flex: 1, minWidth: 0 },
  dataCard: { gap: 14 },
  lines: { gap: 10 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  lineIcon: { paddingTop: 2 },
  backup: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  inventory: { gap: 8 },
  inventoryRow: { flexDirection: "row", gap: 8 },
  tile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  tabular: { fontVariant: ["tabular-nums"] },
  dataActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  dangerCard: { borderColor: themeDomainTone(scheme).danger.border },
}));
