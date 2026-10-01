import { AppText, Button, Sheet } from "@/components/ui";
import { useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

type Props = {
  visible: boolean;
  /** Rótulo do consentimento, em negrito no topo da folha. */
  label: string;
  /** Texto integral (o hint da pergunta, já adaptado ao aparelho). */
  terms: string;
  onClose: () => void;
};

/** "Termos completos": o texto integral de um consentimento numa folha, fechada por "Entendi". */
export function TermsSheet({ visible, label, terms, onClose }: Props) {
  const colors = useThemeColors();
  return (
    <Sheet
      visible={visible}
      title="Termos completos"
      onClose={onClose}
      footer={<Button label="Entendi" wide onPress={onClose} />}
    >
      <AppText weight={700} lineHeight={21}>
        {label}
      </AppText>
      <AppText size={fontSize.sm} lineHeight={21} color={colors.text2}>
        {terms}
      </AppText>
    </Sheet>
  );
}
