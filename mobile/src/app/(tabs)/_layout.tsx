import { Redirect } from "expo-router";
import { AppTabs } from "@/components/layout/tab-bar";
import { useApp } from "@/state/app-context";

/** As abas só existem com anamnese concluída; sem perfil, o app abre na anamnese. */
export default function TabsLayout() {
  const { state } = useApp();
  if (!state.profile) return <Redirect href="/anamnese" />;
  return <AppTabs />;
}
