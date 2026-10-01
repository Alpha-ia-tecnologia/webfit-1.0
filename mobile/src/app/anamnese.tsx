import { OnboardingEntry } from "@/screens/onboarding-entry";
import { useApp } from "@/state/app-context";

export default function AnamneseRoute() {
  const { dataEpoch } = useApp();
  return <OnboardingEntry key={dataEpoch} />;
}
