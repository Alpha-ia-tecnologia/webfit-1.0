import { useSyncExternalStore } from "react";
import type { ThemePref } from "../lib/theme";
import { getThemePref, setThemePref, subscribeThemePref } from "../lib/theme-dom";

/** Escolha "Aparência" deste aparelho, sempre em sincronia com o <html> e com outras abas. */
export function useThemePref(): [ThemePref, (pref: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribeThemePref, getThemePref, getThemePref);
  return [pref, setThemePref];
}
