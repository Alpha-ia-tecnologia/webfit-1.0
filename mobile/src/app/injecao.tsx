import { InjecaoScreen } from "@/screens/injecao";
import { useApp } from "@/state/app-context";

export default function InjecaoRoute() {
  const { editingInjection } = useApp();
  // A chave remonta a tela ao abrir outro registro a partir do aviso de aplicação recente.
  return <InjecaoScreen key={editingInjection?.id ?? "nova"} />;
}
