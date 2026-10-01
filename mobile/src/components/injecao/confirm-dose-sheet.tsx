import { CircleCheck, Info } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { localDate, localTime } from "@shared/lib/domain";
import {
  fmtConcentration,
  fmtMg,
  fmtMl,
  isPenMethod,
  methodInfo,
  recentInjectionText,
  recentInjectionWarning,
  spotLabel,
  suggestedSide,
  volumeMl,
} from "@shared/lib/injection";
import type { InjectionEntry, InjectionMethod, InjectionSide, InjectionSite, SyringeUnits } from "@shared/types";
import type { DoseRecipe } from "@shared/lib/injection";
import { AppText, Button, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { SideRadios, SiteRadios } from "./site-card";
import type { InjectionWhen } from "./use-injection-save";
import { WhenRow, whenDay } from "./when-row";

/** O que vai ser registrado (receita, formulário ou o card do Hoje). */
export interface ConfirmDose {
  method: InjectionMethod;
  medication: string;
  concentration: number | null;
  syringe: SyringeUnits | null;
  units: number | null;
  doseMg: number;
}

/** A dose de sempre como item da confirmação (mesmos valores que serão gravados). */
export function recipeDose(recipe: DoseRecipe): ConfirmDose {
  return {
    method: recipe.method,
    medication: recipe.medication,
    concentration: recipe.concentrationMgPerMl,
    syringe: recipe.syringeUnits,
    units: recipe.units,
    doseMg: recipe.doseMg,
  };
}

type Props = {
  visible: boolean;
  dose: ConfirmDose | null;
  /** Receita e Hoje: local, lado e horário escolhidos aqui; no formulário, só leitura. */
  editable: boolean;
  site: InjectionSite;
  /**
   * Formulário: o lado escolhido (só leitura). Receita: o lado inicial sugerido. Sem valor (Hoje), a folha
   * sugere o oposto do último lado conhecido no local.
   */
  side?: InjectionSide | null;
  suggestedSite: InjectionSite;
  date: string;
  time: string;
  injections: readonly InjectionEntry[];
  perMonth: number | null | undefined;
  isBusy: boolean;
  onConfirm: (when: InjectionWhen) => void;
  onClose: () => void;
  /** "Outra dose ou frasco novo" (usado no Hoje). */
  onOtherDose?: () => void;
};

function CheckItem({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.item} role="listitem">
      <CircleCheck size={18} color={colors.green600} />
      <AppText size={fontSize.base} color={colors.text2} style={styles.grow}>
        <AppText size={fontSize.base} weight={700} color={colors.text}>
          {label}
        </AppText>{" "}
        {value}
      </AppText>
    </View>
  );
}

/** O que a folha registra se nada for mudado: o local sugerido (e o lado dele) agora, ou o formulário. */
function initialWhen({ editable, site, side, suggestedSite, date, time, injections }: Pick<Props, "editable" | "site" | "side" | "suggestedSite" | "date" | "time" | "injections">): InjectionWhen {
  const today = localDate();
  if (!editable) return { site, side: side ?? null, date, time };
  const initialSide = side !== undefined ? side : suggestedSide(injections, suggestedSite, today);
  return { site: suggestedSite, side: initialSide, date: today, time: localTime() };
}

function SheetBody({ dose, editable, site, side, suggestedSite, date, time, injections, perMonth, onChange }: Omit<Props, "visible" | "isBusy" | "onConfirm" | "onClose" | "onOtherDose" | "dose"> & {
  dose: ConfirmDose;
  onChange: (when: InjectionWhen) => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const today = localDate();
  const [chosen, setChosen] = useState<InjectionWhen>(() => initialWhen({ editable, site, side, suggestedSite, date, time, injections }));
  // O que a folha mostra é o que será salvo: publica já na abertura o horário e o local exibidos,
  // em vez de o "Registrar" recalcular "agora" no toque (minutos ou a meia-noite depois).
  useEffect(() => {
    onChange(chosen);
    // Só na montagem: depois disso cada mudança passa por update().
  }, []);
  const update = (next: Partial<InjectionWhen>) => {
    const merged = { ...chosen, ...next };
    setChosen(merged);
    onChange(merged);
  };
  const recent = recentInjectionWarning(injections, chosen.date, perMonth);
  const isPen = isPenMethod(dose.method);
  const units = dose.units;
  return (
    <>
      <View role="list" aria-label="Confira antes de aplicar" style={styles.list}>
        {isPen ? (
          <CheckItem label="Caneta" value={`${dose.medication} · ${methodInfo(dose.method).label}`} />
        ) : (
          <>
            <CheckItem label="Frasco" value={`${dose.medication} · ${dose.concentration === null ? "—" : fmtConcentration(dose.concentration)}`} />
            <CheckItem
              label="Seringa"
              value={`${dose.syringe ?? "—"} UI · aspire até ${units ?? "—"} UI (${units === null ? "—" : fmtMl(volumeMl(units))})`}
            />
          </>
        )}
        <CheckItem label="Dose" value={fmtMg(dose.doseMg)} />
      </View>
      {editable ? (
        <View style={styles.editable}>
          <AppText size={fontSize.sm} weight={700} color={colors.text2}>
            Local de aplicação
          </AppText>
          {/* Trocar o local volta ao lado sugerido para o novo local (o oposto do último lado usado ali). */}
          <SiteRadios
            site={chosen.site}
            suggested={suggestedSite}
            onSite={(next) => update({ site: next, side: next === chosen.site ? chosen.side : suggestedSide(injections, next, today) })}
            compact
          />
          <SideRadios side={chosen.side} suggested={suggestedSide(injections, chosen.site, today)} onSide={(next) => update({ side: next })} compact />
          <WhenRow day={chosen.date} time={chosen.time} onDay={(next) => update({ date: next })} onTime={(next) => update({ time: next })} />
        </View>
      ) : (
        <View style={styles.readOnly}>
          <AppText size={fontSize.sm} color={colors.text2}>
            <AppText size={fontSize.sm} weight={700}>
              Local
            </AppText>{" "}
            · {spotLabel(site, side ?? null)}
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2}>
            <AppText size={fontSize.sm} weight={700}>
              Quando
            </AppText>{" "}
            · {whenDay(date, today)}, {time}
          </AppText>
        </View>
      )}
      {recent && (
        <View style={styles.recent}>
          <Info size={18} color={colors.muted} />
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={19} style={styles.grow}>
            {recentInjectionText(recent, today)}
          </AppText>
        </View>
      )}
    </>
  );
}

/**
 * "Confirmar aplicação" (SERINGA-05): lista do que conferir antes de aplicar e o registro só depois do
 * toque em "Registrar aplicação". Abrir nunca grava; o secundário é "Cancelar" (o "Voltar" é do cabeçalho).
 */
export function ConfirmDoseSheet(props: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { visible, dose, editable, isBusy } = props;
  const [chosen, setChosen] = useState<InjectionWhen | null>(null);
  // Cada abertura começa do zero (local sugerido e agora), inclusive depois de um registro.
  useEffect(() => {
    if (!visible) setChosen(null);
  }, [visible]);
  const close = () => {
    setChosen(null);
    props.onClose();
  };
  const confirm = () => {
    props.onConfirm(chosen ?? initialWhen(props));
  };
  return (
    <Sheet
      visible={visible && dose !== null}
      title="Confirmar aplicação"
      onClose={close}
      footer={
        <View style={styles.footer}>
          <Button label={isBusy ? "Salvando…" : "Registrar aplicação"} icon={CircleCheck} size="lg" wide busy={isBusy} onPress={confirm} />
          <Button label="Cancelar" variant="secondary" wide onPress={close} />
        </View>
      }
    >
      {visible && dose && (
        <>
          <SheetBody
            dose={dose}
            editable={editable}
            site={props.site}
            side={props.side}
            suggestedSite={props.suggestedSite}
            date={props.date}
            time={props.time}
            injections={props.injections}
            perMonth={props.perMonth}
            onChange={setChosen}
          />
          {props.onOtherDose && <Button label="Outra dose ou frasco novo" variant="text" onPress={props.onOtherDose} />}
          <AppText size={fontSize.xs} color={colors.muted}>
            Informativo: siga a prescrição de quem acompanha seu tratamento.
          </AppText>
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  grow: { flex: 1, minWidth: 0 },
  list: { gap: 10 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  editable: { gap: 10 },
  readOnly: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface3 },
  recent: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  footer: { gap: 8 },
}));
