import { lazy, Suspense } from "react";
import { useApp } from "../../lib/context";
import { PartBoundary } from "../LazyScreen";

// Modelo, desenho e impressão do relatório carregam só quando a folha abre: Meu espaço (aquecido no
// ocioso) e Evolução não baixam esse código em toda sessão.
const ReportSheet = lazy(() => import("./ReportSheet").then((m) => ({ default: m.ReportSheet })));

/** Aviso quando a folha não abre (arquivo de uma versão anterior, conexão caída). */
export const REPORT_LOAD_ERROR =
  "Não foi possível abrir o relatório. Recarregue o app para tentar de novo.";

/**
 * "Relatório para consulta" sob demanda (ESPACO-08): a mesma folha de sempre; se o arquivo não chega,
 * ela fecha com um aviso e a tela segue de pé.
 */
export function LazyReportSheet({ onClose }: { onClose: () => void }) {
  const { notify } = useApp();
  return (
    <PartBoundary
      onError={() => {
        onClose();
        notify(REPORT_LOAD_ERROR, "warning");
      }}
    >
      <Suspense fallback={null}>
        <ReportSheet onClose={onClose} />
      </Suspense>
    </PartBoundary>
  );
}
