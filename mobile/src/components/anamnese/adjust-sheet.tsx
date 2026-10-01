import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { answerText, isShown } from "@shared/components/anamnese/progress";
import { questionnaire, type Question } from "@shared/data/questionnaire";
import { localDate } from "@shared/lib/domain";
import { ADJUST_TITLE, REVIEW_DISCLAIMER } from "@shared/lib/plan-reveal";
import type { Draft } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { onDevice } from "./device-copy";

type Props = {
  answers: Draft;
  isAnswered: (field: Question) => boolean;
  onEditStep: (step: number) => void;
  onClose: () => void;
};

/**
 * "Ajustar" no fim da anamnese (AdjustSheet do web): as respostas por etapa, que antes ocupavam a página,
 * numa folha com "Editar esta etapa" e o aviso de que estimativas não substituem um profissional.
 * Quem abre a folha também a fecha (inclusive ao editar uma etapa).
 */
export function AdjustSheet({ answers, isAnswered, onEditStep, onClose }: Props) {
  const colors = useThemeColors();
  const lastStep = questionnaire.length - 1;
  const today = localDate();
  return (
    <Sheet visible title={ADJUST_TITLE} onClose={onClose}>
      <AppText size={fontSize.sm} lineHeight={20} color={colors.muted}>
        {REVIEW_DISCLAIMER}
      </AppText>
      {questionnaire.slice(0, lastStep).map((group, i) => {
        const fields = group.fields.filter((field) => isShown(answers, field, today));
        return (
          <ReviewGroup
            key={group.title}
            title={group.title}
            filled={fields.filter(isAnswered).length}
            rows={fields.map((field) => ({ key: field.key, label: onDevice(field.label), answer: answerText(field, answers[field.key]) }))}
            defaultOpen={i === 0}
            onEdit={() => onEditStep(i)}
          />
        );
      })}
    </Sheet>
  );
}

type GroupProps = {
  title: string;
  filled: number;
  rows: { key: string; label: string; answer: string }[];
  defaultOpen: boolean;
  onEdit: () => void;
};

/** Uma etapa recolhível (.review-group, o <details> do web): "N de M" respondidas e as respostas. */
function ReviewGroup({ title, filled, rows, defaultOpen, onEdit }: GroupProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(defaultOpen);
  const Chevron = isOpen ? ChevronUp : ChevronDown;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        {...webAttrs({ "aria-expanded": isOpen })}
        onPress={() => setOpen(!isOpen)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <AppText heading size={fontSize.base} weight={700} color={colors.text2} style={styles.grow}>
          {title}
        </AppText>
        <View style={styles.badge}>
          <AppText size={fontSize.xs} weight={700} color={colors.green800}>
            {`${filled} de ${rows.length}`}
          </AppText>
        </View>
        <Chevron size={18} color={colors.muted} />
      </Pressable>
      {isOpen ? (
        <>
          {rows.map((row) => (
            <View key={row.key} style={styles.row}>
              <AppText size={fontSize.xs} color={colors.muted}>
                {row.label}
              </AppText>
              <AppText size={fontSize.sm} weight={600} color={colors.text2}>
                {row.answer}
              </AppText>
            </View>
          ))}
          <Button label="Editar esta etapa" variant="text" onPress={onEdit} />
        </>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  pressed: { opacity: 0.7 },
  grow: { flex: 1, minWidth: 0 },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.mint50,
  },
  row: {
    gap: 2,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
}));
