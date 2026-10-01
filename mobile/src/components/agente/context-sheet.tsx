import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Cpu,
  FileText,
  ListChecks,
  Lock,
  Ruler,
  ShieldCheck,
  Syringe,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  agentContextChips,
  providerLabel,
  type AiProviders,
  type ContextChip,
} from "@shared/lib/agent-presentation";
import type { AppState } from "@shared/types";
import { AppText, Button, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const CHIP_ICON: Record<ContextChip["key"], LucideIcon> = {
  anamnese: ClipboardList,
  diario: BookOpen,
  medidas: Ruler,
  combinados: ListChecks,
  doses: Syringe,
  exames: FileText,
};

function Chip({ chip, isOn }: { chip: ContextChip; isOn: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const Icon = CHIP_ICON[chip.key];
  return (
    <View
      accessible
      accessibilityLabel={`${chip.label}: ${chip.detail}`}
      style={[styles.chip, !isOn && styles.chipOff]}
    >
      <View style={styles.chipIcon}>
        <Icon size={17} color={isOn ? colors.green700 : colors.muted} />
      </View>
      <View style={styles.chipCopy}>
        <AppText size={fontSize.sm} weight={700} numberOfLines={1}>
          {chip.label}
        </AppText>
        <AppText
          size={fontSize["2xs"]}
          color={isOn ? colors.text2 : colors.muted}
          numberOfLines={2}
        >
          {chip.detail}
        </AppText>
      </View>
    </View>
  );
}

/** Como filho do painel, a grade só é calculada enquanto o Modal mostra o conteúdo. */
function ContextChips({ state, consent }: { state: AppState; consent: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.grid}>
      {agentContextChips(state).map((chip) => (
        <View key={chip.key} style={styles.cell}>
          <Chip chip={chip} isOn={chip.active && consent} />
        </View>
      ))}
    </View>
  );
}

/**
 * "O que o agente considera": chips com estado; os textos integrais continuam no detalhe.
 * A tela remonta o painel a cada abertura (como o Modal do web), então o detalhe volta fechado.
 */
export function ContextSheet({
  visible,
  state,
  providers,
  onClose,
  onManage,
}: {
  visible: boolean;
  state: AppState;
  providers: AiProviders | null;
  onClose: () => void;
  onManage: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isMoreOpen, setMoreOpen] = useState(false);
  const consent = !!state.profile?.consentAi;
  const Chevron = isMoreOpen ? ChevronUp : ChevronDown;
  return (
    <Sheet visible={visible} title="O que o agente considera" onClose={onClose}>
      <AppText size={fontSize.sm} color={colors.muted}>
        {consent
          ? "Enviado só quando você pede uma resposta."
          : "Compartilhamento desativado: nada é enviado à IA."}
      </AppText>
      {/* Sem depender de `visible`: nada some antes do fim do fade de saída. */}
      <ContextChips state={state} consent={consent} />
      <View style={styles.line}>
        <Cpu size={15} color={colors.green700} />
        <AppText size={fontSize.sm} color={colors.text2} style={styles.grow}>
          Processado por {providerLabel(providers)}
        </AppText>
      </View>
      <View style={styles.more}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isMoreOpen }}
          aria-expanded={isMoreOpen}
          onPress={() => setMoreOpen(!isMoreOpen)}
          style={styles.moreToggle}
        >
          <AppText size={fontSize.sm} weight={600} color={colors.green700}>
            Detalhes do compartilhamento
          </AppText>
          <Chevron size={16} color={colors.green700} />
        </Pressable>
        {isMoreOpen ? (
          <>
            <AppText size={fontSize.sm} color={colors.text2}>
              Ao solicitar uma resposta, o contexto pode incluir suas respostas
              de saúde e rotina, registros dos últimos sete dias, medições,
              combinados, doses dos últimos 30 dias e informações de exames. Nome e
              nascimento são removidos dos campos estruturados. Evite
              identificadores em mensagens e arquivos.
            </AppText>
            <AppText size={fontSize.sm} color={colors.text2}>
              A DeepSeek e/ou a OpenAI processam o pedido conforme a
              configuração do serviço. Se ambas estiverem configuradas, a OpenAI
              pode receber o mesmo conteúdo como alternativa. Você pode
              desativar o compartilhamento em Meu espaço.
            </AppText>
          </>
        ) : null}
      </View>
      {/* A linha de revisão saiu da barra do chat (conceito 05) e mora aqui. */}
      <View style={[styles.line, styles.lock]}>
        <ShieldCheck size={15} color={colors.green700} />
        <AppText size={fontSize.sm} color={colors.text2} style={styles.grow}>
          {consent ? "Revisão automática, sem revisão humana · apoio educativo" : "Contexto não compartilhado com a IA"}
        </AppText>
      </View>
      <View style={styles.line}>
        <Lock size={15} color={colors.green700} />
        <AppText size={fontSize.sm} color={colors.text2} style={styles.grow}>
          Seu contexto: sem nome nem data de nascimento.
        </AppText>
      </View>
      <Button
        label="Gerenciar em Meu espaço"
        variant="secondary"
        onPress={onManage}
      />
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  cell: { width: "50%", padding: 4 },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.mint50,
    borderWidth: 1,
    borderColor: colors.mint100,
  },
  chipOff: { backgroundColor: colors.surface3, borderColor: colors.border },
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  chipCopy: { flex: 1, minWidth: 0 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  grow: { flex: 1 },
  lock: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  more: { gap: 8 },
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    // 44 pt de toque; a margem negativa mantém o espaçamento visual de antes.
    minHeight: 44,
    marginVertical: -6,
  },
}));
