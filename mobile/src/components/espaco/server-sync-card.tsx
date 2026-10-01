import { Database, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { SERVER_SYNC_COPY, syncStatusLabel } from "@shared/lib/server-sync";
import { AppText, Button, Card, Field, Sheet, TextField } from "@/components/ui";
import { confirmAsync } from "@/lib/confirm";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { SettingGroup, StatusRow, SwitchRow } from "./setting-row";

/** "Cópia no servidor" em Ajustes: online, a da conta; local, opcional e desligada por padrão. Igual ao web. */
export function ServerSyncCard() {
  const { account } = useApp();
  return account ? <AccountSyncCard accountId={account.info.id} /> : <LocalSyncCard />;
}

/** Online: a cópia é da conta e fica sempre ligada; aqui só a situação e a escolha num conflito. */
function AccountSyncCard({ accountId }: { accountId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { sync } = useApp();
  const badge = syncStatusLabel(sync.status);
  return (
    <Card style={styles.card}>
      <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
        Cópia na sua conta
      </AppText>
      <SettingGroup>
        <StatusRow icon={RefreshCw} label="Situação" status={badge.label} tone={badge.tone || "neutral"} />
      </SettingGroup>
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
        Cada mudança sobe para a sua conta alguns segundos depois. Sem internet, sobe quando a conexão voltar.
      </AppText>
      {sync.status.kind === "error" && (
        <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
          {sync.status.message}
        </AppText>
      )}
      {sync.status.kind === "conflict" && (
        <View style={styles.conflict} accessibilityRole="alert">
          <AppText size={fontSize.sm} weight={600} style={styles.conflictText}>
            A sua conta tem uma versão mais nova que a deste aparelho (de outro aparelho, por exemplo).
          </AppText>
          <View style={styles.actions}>
            <Button
              label="Usar a da conta"
              variant="secondary"
              onPress={() => void sync.restoreFromServer(accountId)}
            />
            <Button label={SERVER_SYNC_COPY.sendMine} variant="secondary" onPress={() => void sync.sendMine()} />
          </View>
        </View>
      )}
    </Card>
  );
}

/** Local (computador ou rede Wi-Fi): opcional, por código da instalação. */
function LocalSyncCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { state, sync } = useApp();
  // Otimista, como os outros interruptores: muda na hora e fica travado até a gravação terminar.
  const [pending, setPending] = useState<boolean | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const badge = syncStatusLabel(sync.status);
  const toggle = async (enabled: boolean) => {
    setPending(enabled);
    try {
      // O alerta nativo tem dois botões: "Cancelar" desliga e mantém a cópia (dito na mensagem).
      const wipe =
        !enabled &&
        sync.available &&
        (await confirmAsync(
          SERVER_SYNC_COPY.turnOffTitle,
          `${SERVER_SYNC_COPY.turnOffMessage} Em "Cancelar", a cópia é mantida.`,
          "Apagar cópia",
          true,
        ));
      await sync.setEnabled(enabled, wipe);
    } finally {
      setPending(null);
    }
  };
  return (
    <Card style={styles.card}>
      <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
        {SERVER_SYNC_COPY.title}
      </AppText>
      <SettingGroup>
        <SwitchRow
          icon={Database}
          label="Guardar uma cópia no servidor"
          value={pending ?? state.serverSync}
          disabled={pending !== null || (!sync.available && !state.serverSync)}
          onChange={(enabled) => void toggle(enabled)}
        />
        <StatusRow icon={RefreshCw} label="Situação" status={badge.label} tone={badge.tone || "neutral"} />
      </SettingGroup>
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
        {sync.available ? SERVER_SYNC_COPY.hint : SERVER_SYNC_COPY.unavailable}
      </AppText>
      {sync.status.kind === "error" && (
        <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
          {sync.status.message}
        </AppText>
      )}
      {sync.status.kind === "conflict" && (
        <View style={styles.conflict} accessibilityRole="alert">
          <AppText size={fontSize.sm} weight={600} style={styles.conflictText}>
            {SERVER_SYNC_COPY.conflict}
          </AppText>
          <View style={styles.actions}>
            <Button label={SERVER_SYNC_COPY.sendMine} variant="secondary" onPress={() => void sync.sendMine()} />
            <Button label={SERVER_SYNC_COPY.restore} variant="secondary" onPress={() => setRestoreOpen(true)} />
          </View>
        </View>
      )}
      {state.serverSync && (
        <View style={styles.code}>
          <AppText size={fontSize.xs} weight={700} color={colors.text2}>
            {SERVER_SYNC_COPY.codeLabel}
          </AppText>
          <AppText selectable size={fontSize.xs} style={styles.codeValue} testID="sync-code">
            {state.userId}
          </AppText>
          <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
            {SERVER_SYNC_COPY.codeHint} Toque e segure o código para copiar.
          </AppText>
        </View>
      )}
      {sync.available && sync.status.kind !== "conflict" && (
        <View style={styles.actions}>
          <Button label={SERVER_SYNC_COPY.restore} variant="secondary" onPress={() => setRestoreOpen(true)} />
        </View>
      )}
      <RestoreFromServer visible={restoreOpen} onClose={() => setRestoreOpen(false)} />
    </Card>
  );
}

/** Pede o código, confere a cópia (as mesmas regras do backup em arquivo) e substitui os dados. */
function RestoreFromServer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { state, sync } = useApp();
  const [code, setCode] = useState(state.userId);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await work()) onClose();
    } finally {
      setBusy(false);
    }
  };
  const deleteCopy = async () =>
    (await confirmAsync(
      "Apagar a cópia deste código?",
      "A cópia sai do servidor e não pode ser recuperada. Os dados deste aparelho não mudam.",
      "Apagar cópia",
      true,
    )) && sync.deleteCopy(code);
  const hasCode = code.trim().length > 0;
  return (
    <Sheet
      visible={visible}
      title={SERVER_SYNC_COPY.restore}
      onClose={() => !busy && onClose()}
      footer={
        <View style={styles.sheetActions}>
          <Button
            label={busy ? "Aguarde…" : "Substituir dados e restaurar"}
            wide
            disabled={busy || !hasCode}
            onPress={() => void run(() => sync.restoreFromServer(code))}
          />
          <Button
            label={SERVER_SYNC_COPY.deleteCopy}
            variant="text"
            tone="danger"
            disabled={busy || !hasCode}
            onPress={() => void run(deleteCopy)}
          />
        </View>
      }
    >
      <Field label={SERVER_SYNC_COPY.codeLabel}>
        <TextField
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={SERVER_SYNC_COPY.codeLabel}
        />
      </Field>
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
        {SERVER_SYNC_COPY.codeHint}
      </AppText>
      <AppText color={colors.text2} lineHeight={21}>
        Restaurar substitui os dados deste aparelho pela cópia do servidor. Exporte um backup antes se quiser
        mantê-los. A autorização de IA e os lembretes ficam desativados após a restauração.
      </AppText>
    </Sheet>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  card: { gap: 12 },
  conflict: {
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).attention.border,
    backgroundColor: themeDomainTone(scheme).attention.bg,
  },
  conflictText: { color: themeDomainTone(scheme).attention.fg },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  code: { gap: 6 },
  codeValue: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  sheetActions: { gap: 8 },
}));
