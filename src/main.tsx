// Primeiro: o zod não testa `new Function` sob a CSP (ver o arquivo).
import "./lib/zod-csp";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initTheme } from "./lib/theme-dom";
// Fontes do padrão visual WebFit servidas localmente (compatível com a CSP font-src 'self').
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles/tokens.css";
import "./index.css";

// Tema escolhido em Aparência ("Claro"/"Escuro") antes do primeiro desenho; "Sistema" é só CSS.
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
