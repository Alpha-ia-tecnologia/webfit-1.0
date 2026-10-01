import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReportModel } from "../../lib/report";
import { REPORT_CSS, renderReportHtml } from "../../lib/report-html";
import "./Report.css";

const PRINTING_CLASS = "is-printing-report";

/**
 * Impressão do "Relatório para consulta" (ESPACO-08), tudo neste aparelho: monta o relatório fora
 * da tela, marca o <html> para o CSS de impressão, chama window.print() e sai no afterprint (ou ao
 * desmontar). Único ponto do app que injeta HTML: ele vem só de renderReportHtml, que escapa todo
 * texto (guarda em tests/report-html.test.ts), e a CSP de produção barra script inline de todo modo.
 */
export function ReportPrint({
  model,
  onDone,
}: {
  model: ReportModel;
  /** Depois da impressão (afterprint): o relatório sai do documento. */
  onDone: () => void;
}) {
  const html = renderReportHtml(model);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  // No StrictMode (dev) o efeito roda duas vezes: imprime uma vez por relatório montado.
  const printed = useRef<ReportModel | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const done = () => {
      root.classList.remove(PRINTING_CLASS);
      onDoneRef.current();
    };
    root.classList.add(PRINTING_CLASS);
    window.addEventListener("afterprint", done);
    if (printed.current !== model) {
      printed.current = model;
      window.print();
    }
    return () => {
      window.removeEventListener("afterprint", done);
      root.classList.remove(PRINTING_CLASS);
    };
  }, [model]);
  return createPortal(
    <div className="report-print-root" aria-hidden="true">
      <style>{REPORT_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
    document.body,
  );
}
