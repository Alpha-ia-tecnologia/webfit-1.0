import { Download, ShieldCheck } from "lucide-react-native";
import { View } from "react-native";
import { localDate } from "@shared/lib/domain";
import { backupStatus } from "@shared/lib/space";
import { RestoreBackup } from "@/components/restore-backup";
import { AppText, Button, Sheet } from "@/components/ui";
import { confirmAsync } from "@/lib/confirm";
import { exportBackup, useLastBackup } from "@/lib/last-backup";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/**
 * "Backup e dados" do primeiro acesso: situação do backup, exportar, restaurar e o recomeço
 * (com a mesma confirmação de antes). O cartão "Seus dados" continua na tela.
 */
export function StarterDataSheet({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const { state, notify, reset } = useApp();
  const lastBackup = useLastBackup();
  const backup = lastBackup === undefined ? null : backupStatus(lastBackup);
  const backupTone = {
    ok: { fg: colors.green800, bg: colors.mint50 },
    attention: { fg: domainTone.attention.fg, bg: domainTone.attention.bg },
  } as const;
  const startOver = async () => {
    if (
      !(await confirmAsync(
        "Excluir seus dados deste aparelho?",
        "Exporte um backup antes se quiser mantê-los. Esta ação não pode ser desfeita.",
        "Excluir dados",
        true,
      ))
    )
      return;
    try {
      onClose();
      await reset();
      onReset();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível excluir os dados.", "warning");
    }
  };
  return (
    <Sheet visible title="Backup e dados" onClose={onClose}>
      {backup ? (
        <View style={[styles.backup, { backgroundColor: backupTone[backup.tone].bg }]} accessible accessibilityLabel={backup.label}>
          <ShieldCheck size={16} color={backupTone[backup.tone].fg} />
          <AppText size={fontSize.sm} weight={600} color={backupTone[backup.tone].fg}>
            {backup.label}
          </AppText>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Exportar backup"
          variant="secondary"
          icon={Download}
          onPress={() =>
            void exportBackup(state, `webfit-${localDate()}.json`).catch((cause: Error) => notify(cause.message, "warning"))
          }
        />
        <RestoreBackup />
      </View>
      <Button label="Excluir dados e recomeçar" variant="text" tone="danger" onPress={() => void startOver()} />
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  backup: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
}));
