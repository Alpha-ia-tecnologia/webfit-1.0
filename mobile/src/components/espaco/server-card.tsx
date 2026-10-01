import { Wifi } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { DISCOVERY_DECLINED } from "@shared/lib/server-discovery";
import { AppText, Button, Card, TextField } from "@/components/ui";
import { AGENT_NOT_CONFIGURED } from "@/lib/api";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/**
 * Endereço do servidor do agente (só no app nativo): procurar na rede ou informar à mão.
 * `embedded` dispensa o cartão e o título (dentro de "Avançado: servidor do agente").
 */
export function ServerCard({ embedded = false }: { embedded?: boolean } = {}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { notify, aiReady, apiUrl, updateApiUrl, apiError, discoverServer } = useApp();
  const [serverUrl, setServerUrl] = useState(apiUrl);
  const [isTesting, setTesting] = useState(false);
  const discover = async () => {
    setTesting(true);
    try {
      const outcome = await discoverServer();
      if (outcome.kind === "adopted") {
        setServerUrl(outcome.url);
        notify(`Servidor encontrado em ${outcome.url}.`);
      } else if (outcome.kind === "declined") {
        notify(DISCOVERY_DECLINED);
      } else {
        notify(
          "Nenhum servidor WebFit encontrado na rede. Confira se o computador está ligado, com o servidor do WebFit aberto, e na mesma Wi-Fi.",
          "warning",
        );
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível procurar o servidor.", "warning");
    } finally {
      setTesting(false);
    }
  };
  const save = async () => {
    setTesting(true);
    try {
      const status = await updateApiUrl(serverUrl);
      notify(
        status.ready ? "Servidor conectado. O agente está pronto." : AGENT_NOT_CONFIGURED,
        status.ready ? undefined : "warning",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Não foi possível conectar ao servidor.",
        "warning",
      );
    } finally {
      setTesting(false);
    }
  };
  const content = (
    <>
      {embedded ? null : (
        <View style={styles.headRow}>
          <Wifi size={18} color={colors.green700} />
          <AppText heading size={fontSize.lg} weight={700} style={styles.grow} accessibilityRole="header">
            Servidor do agente
          </AppText>
        </View>
      )}
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
        O agente usa o servidor do WebFit no seu computador. Na mesma Wi-Fi o app volta sozinho ao
        servidor que você já usa; um servidor novo só é usado depois que você confirmar. Se o
        endereço mudar, toque em Procurar na rede ou informe o endereço mostrado no computador.
      </AppText>
      <TextField
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="http://192.168.0.10:3000"
        accessibilityLabel="Endereço do servidor do agente"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <AppText size={fontSize.xs} color={aiReady ? colors.green700 : colors.muted}>
        {aiReady ? `Conectado a ${apiUrl}` : `Sem conexão com ${apiUrl}`}
      </AppText>
      {!aiReady && apiError ? (
        <AppText size={fontSize["2xs"]} color={colors.errorText} lineHeight={16}>
          {apiError}
        </AppText>
      ) : null}
      <View style={styles.headRow}>
        <Button
          label={isTesting ? "Aguarde…" : "Procurar na rede"}
          variant="secondary"
          size="sm"
          icon={Wifi}
          disabled={isTesting}
          onPress={() => void discover()}
        />
        <Button
          label={isTesting ? "Aguarde…" : "Testar e salvar"}
          variant="secondary"
          size="sm"
          disabled={isTesting}
          onPress={() => void save()}
        />
      </View>
      {embedded ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          Para quem configura: no computador, rode npm run dev:lan.
        </AppText>
      ) : null}
    </>
  );
  return embedded ? <View style={styles.embedded}>{content}</View> : <Card>{content}</Card>;
}

const useStyles = makeStyles(() => ({
  grow: { flex: 1, minWidth: 0 },
  embedded: { gap: 12 },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
}));
