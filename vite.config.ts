import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      // Fontes nunca viram data: URI: a CSP de produção só aceita font-src 'self'
      // (subconjuntos pequenos, como o cirílico da Plus Jakarta, eram embutidos e bloqueados).
      assetsInlineLimit: (file: string) =>
        /\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined,
      rollupOptions: {
        output: {
          // Bibliotecas estáveis em arquivos próprios: uma nova versão do app não invalida o cache delas.
          // O motion e os ícones ficam de fora: o Hoje usa só uma parte, o resto vai com as telas sob demanda.
          manualChunks(id: string) {
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
              return "vendor-react";
            if (/[\\/]node_modules[\\/]zod[\\/]/.test(id)) return "vendor-zod";
            // Tabela TACO (~200 KB): muda raramente, então também fica em cache entre versões.
            if (/[\\/]src[\\/]data[\\/]foods\.json$/.test(id)) return "data-foods";
            return undefined;
          },
          // Junta pedacinhos (ícones, utilitários de 1 KB) em vez de um pedido de rede para cada um.
          experimentalMinChunkSize: 8_000,
        },
      },
    },
    server: {
      // DISABLE_HMR=true desativa HMR e o observador de arquivos (útil em ambientes de edição automatizada).
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
  };
});
