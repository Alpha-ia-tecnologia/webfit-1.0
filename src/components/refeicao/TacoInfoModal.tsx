import { fmtNumber } from "../../lib/format";
import { Modal } from "../UI";

/** "De onde vêm os valores" (ⓘ da seção "Tabela TACO"): a fonte e o aviso das medidas caseiras. */
export function TacoInfoModal({ foodCount, onClose }: { foodCount: number; onClose: () => void }) {
  return (
    <Modal title="De onde vêm os valores" onClose={onClose}>
      <p>
        {fmtNumber(foodCount)} alimentos da{" "}
        <a href="https://nepa.unicamp.br/categoria/taco/" target="_blank" rel="noreferrer">
          TACO · NEPA/UNICAMP, 4ª edição (2011)
        </a>
        , com a composição por 100 g.
      </p>
      <p className="hint">
        As medidas caseiras (colher, concha, unidade) são aproximadas. Quando puder, confira na
        balança e ajuste os gramas.
      </p>
    </Modal>
  );
}
