/**
 * Estilos das telas carregadas sob demanda (App.tsx), importados de uma vez no arquivo inicial.
 *
 * As telas viraram arquivos separados, mas o CSS continua num arquivo só e NA MESMA ORDEM de
 * antes da divisão: a cascata (regras de mesma especificidade em arquivos diferentes) não muda e
 * nenhuma tela pisca sem estilo ao abrir. Cada componente continua importando o próprio CSS; aqui
 * só se fixa a posição. CSS novo de uma tela sob demanda entra nesta lista, na posição em que o
 * App o alcançaria.
 */
import "./Anamnese.css";
import "./anamnese/AnamneseInputs.css";
import "./anamnese/AnamneseWidgets.css";
import "./anamnese/AnamneseSchedule.css";
import "./Plate.css";
import "./anamnese/PlanReveal.css";
import "./anamnese/SectionEdit.css";
import "./OverflowMenu.css";
import "./OnboardingEntry.css";
import "./injecao/Injecao.css";
import "./injecao/Rotation.css";
import "./AiProgress.css";
import "./RichText.css";
import "./Dieta.css";
import "./IconTile.css";
import "./Controls.css";
import "./despensa/Recipes.css";
import "./Despensa.css";
import "./hoje/Hoje.css";
import "./diario/Diario.css";
import "./evolucao/Evolucao.css";
import "./agente/ChatBlocks.css";
import "./agente/Agente.css";
import "./evolucao/EvolucaoCards.css";
import "./espaco/Documents.css";
import "./espaco/Health.css";
import "./espaco/Appearance.css";
import "./espaco/Settings.css";
import "./espaco/Espaco.css";
import "./refeicao/PhotoDraft.css";
import "./refeicao/Refeicao.css";
import "./lembretes/Lembretes.css";
