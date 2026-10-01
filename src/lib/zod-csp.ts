import { z } from "zod";

/**
 * A CSP de produção (script-src 'self', sem 'unsafe-eval') não deixa o zod compilar validadores
 * com `new Function`. Sem esta opção ele ainda testa se pode (o erro é engolido, mas o navegador
 * registra uma violação de CSP a cada abertura); com ela, usa direto o caminho sem eval — o
 * mesmo que já usaria. Importado primeiro no main.tsx, antes de qualquer validação.
 */
z.config({ jitless: true });
