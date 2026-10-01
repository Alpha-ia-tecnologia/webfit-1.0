import { Sparkles, UserRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AUTH_COPY, quotaLabel, type AccountControls } from "@shared/lib/account";
import { AppText, Button, Card, Field, Sheet, TextField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { SettingGroup, StatusRow } from "./setting-row";

/** "Sua conta" em Ajustes (só no servidor online): quem entrou, IA de hoje, senha, sair e excluir. */
export function AccountCard({ account }: { account: AccountControls }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { info, quota, refreshQuota } = account;
  const [sheet, setSheet] = useState<"password" | "delete" | null>(null);
  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);
  return (
    <Card style={styles.card}>
      <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
        Sua conta
      </AppText>
      <View style={styles.who}>
        <AppText weight={600}>{info.name || "Conta"}</AppText>
        <AppText size={fontSize.sm} color={colors.muted} testID="account-email">
          {info.email}
        </AppText>
      </View>
      <SettingGroup>
        {info.role === "owner" && <StatusRow icon={UserRound} label="Papel" status="Dono do servidor" tone="ok" />}
        <StatusRow icon={Sparkles} label="Pedidos ao agente" status={quota ? quotaLabel(quota) : "…"} tone="neutral" />
      </SettingGroup>
      <View style={styles.actions}>
        <Button label="Trocar senha" variant="secondary" onPress={() => setSheet("password")} />
        <Button label="Sair da conta" variant="secondary" onPress={() => void account.logOut()} />
      </View>
      <Button label="Excluir minha conta" variant="text" tone="danger" onPress={() => setSheet("delete")} />
      <PasswordSheet account={account} visible={sheet === "password"} onClose={() => setSheet(null)} />
      <DeleteSheet account={account} visible={sheet === "delete"} onClose={() => setSheet(null)} />
    </Card>
  );
}

function PasswordSheet({
  account,
  visible,
  onClose,
}: {
  account: AccountControls;
  visible: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (busy) return;
    setCurrent("");
    setNext("");
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    try {
      if (await account.changePassword(current, next)) {
        setCurrent("");
        setNext("");
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      title="Trocar senha"
      onClose={close}
      footer={
        <Button
          label={busy ? "Aguarde…" : "Trocar senha"}
          wide
          disabled={busy || !current || next.length < 8}
          onPress={() => void submit()}
        />
      }
    >
      <Field label="Senha atual">
        <TextField value={current} onChangeText={setCurrent} secureTextEntry accessibilityLabel="Senha atual" />
      </Field>
      <Field label={AUTH_COPY.newPassword} hint={AUTH_COPY.passwordHint}>
        <TextField
          value={next}
          onChangeText={setNext}
          secureTextEntry
          textContentType="newPassword"
          accessibilityLabel={AUTH_COPY.newPassword}
        />
      </Field>
    </Sheet>
  );
}

function DeleteSheet({
  account,
  visible,
  onClose,
}: {
  account: AccountControls;
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await account.deleteAccount(password);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      title={AUTH_COPY.deleteTitle}
      onClose={() => !busy && onClose()}
      footer={
        <Button
          label={busy ? "Aguarde…" : "Excluir conta e dados"}
          variant="danger"
          wide
          disabled={busy || !password}
          onPress={() => void submit()}
        />
      }
    >
      <AppText color={colors.text2} lineHeight={21}>
        {AUTH_COPY.deleteMessage}
      </AppText>
      <AppText size={fontSize.sm} color={colors.muted} lineHeight={20}>
        Exporte um backup antes se quiser guardar uma cópia sua.
      </AppText>
      <Field label="Confirme com sua senha">
        <TextField
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          accessibilityLabel="Confirme com sua senha"
        />
      </Field>
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  card: { gap: 12 },
  who: { gap: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
}));
