import os from "node:os";
import express from "express";
import { createServer as createViteServer } from "vite";
import { config } from "dotenv";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requestSchema, mediaPart } from "./agent";
import { scanPantry } from "./pantry";
import { slidingWindow } from "./rate-limit";
import {
  createDeepSeekGenerate,
  createOpenAIGenerate,
  withFallback,
  type Generate,
} from "./model";
import { buildAgentGraph, runAgent, type AgentGraph } from "./graph/graph";
import { AgentError, TOTAL_BUDGET_MS } from "./graph/state";
import { NDJSON_TYPE, type AgentStreamEvent } from "../src/lib/agent-stream";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.disable("x-powered-by");
app.set("query parser", "simple");
const port = Number(process.env.PORT || 3000);
const token = randomBytes(32).toString("hex");
const production = process.argv.includes("--production");
/** --lan expõe o servidor na rede local (Wi-Fi) para testar o app nativo no celular; o padrão continua só este computador. */
const lan = process.argv.includes("--lan") || process.env.WEBFIT_LAN === "1";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
/** Endereços de rede privada (Wi-Fi doméstica, cabo) vêm primeiro; interfaces virtuais e públicas ficam por último. */
const isPrivateIPv4 = (ip: string) =>
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
/** IPv4 das interfaces locais (sem loopback nem enlace local 169.254); a lista muda ao trocar de rede, por isso é lida a cada pedido. */
function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (i): i is os.NetworkInterfaceInfo =>
        !!i &&
        i.family === "IPv4" &&
        !i.internal &&
        !i.address.startsWith("169.254."),
    )
    .map((i) => i.address)
    .sort((x, y) => Number(isPrivateIPv4(y)) - Number(isPrivateIPv4(x)));
}
/** Chaves de exemplo (MY_...) não contam como configuração. */
const configured = (key: string | undefined) => !!key && !key.startsWith("MY_");
/** Provedores disponíveis (nunca expõe chaves): DeepSeek é o principal, OpenAI a reserva. */
const providers = () => ({
  deepseek: configured(process.env.DEEPSEEK_API_KEY),
  openai: configured(process.env.OPENAI_API_KEY) && !!process.env.OPENAI_MODEL,
});
const ready = () => {
  const available = providers();
  return available.deepseek || available.openai;
};
/** Só DeepSeek, só OpenAI, ou DeepSeek com a OpenAI como reserva por pedido. */
function buildGenerate(): Generate {
  const available = providers();
  const deepseek = available.deepseek
    ? createDeepSeekGenerate({
        apiKey: process.env.DEEPSEEK_API_KEY!,
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        visionModel: process.env.DEEPSEEK_VISION_MODEL || undefined,
        thinking: process.env.DEEPSEEK_THINKING === "1",
      })
    : undefined;
  const openai = available.openai
    ? createOpenAIGenerate({
        apiKey: process.env.OPENAI_API_KEY!,
        model: process.env.OPENAI_MODEL!,
        fastModel: process.env.OPENAI_MODEL_FAST || undefined,
      })
    : undefined;
  const generate =
    deepseek && openai ? withFallback(deepseek, openai) : (deepseek ?? openai);
  if (!generate)
    throw new AgentError(
      "provider",
      "O agente ainda não está conectado. Configure o serviço e tente novamente.",
    );
  return generate;
}
let graph: AgentGraph | undefined;
/** O grafo é compilado uma vez, na primeira solicitação com credenciais válidas. */
function agentGraph(): AgentGraph {
  graph ??= buildAgentGraph({ generate: buildGenerate() });
  return graph;
}
app.use((req, res, next) => {
  const host = req.hostname;
  if (!LOCAL_HOSTS.has(host) && !(lan && lanAddresses().includes(host)))
    return res
      .status(403)
      .send(
        lan
          ? "Acesso disponível somente neste computador ou pela rede local."
          : "Acesso disponível somente neste computador.",
      );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=()");
  if (production)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
  next();
});
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const seenClients = new Set<string>();
/** Na rede local, cada aparelho consulta o estado no máximo 30 vezes por minuto (o app pede 1 por minuto). */
const statusWindow = slidingWindow(30, 60_000);
app.get("/api/status", (req, res) => {
  const client = req.ip?.replace(/^::ffff:/, "") ?? "";
  if (lan && client && !LOCAL_HOSTS.has(client) && statusWindow.hit(client))
    return res
      .status(429)
      .json({ error: "Muitas consultas seguidas. Aguarde um minuto." });
  if (lan && client && !LOCAL_HOSTS.has(client) && !seenClients.has(client)) {
    seenClients.add(client);
    console.log(`Cliente da rede conectado: ${client}`);
  }
  // O nome do computador permite ao app tentar <nome>.local antes de varrer a rede.
  res.json({
    ready: ready(),
    token,
    providers: providers(),
    ...(lan ? { hostname: os.hostname() } : {}),
  });
});
app.use("/api", express.json({ limit: "8mb" }));
let active = 0;
let times: number[] = [];
function authorized(req: express.Request) {
  const header = req.get("X-WebFit-Token") || "";
  const origin = req.get("Origin");
  return (
    /^[a-f0-9]{64}$/.test(header) &&
    timingSafeEqual(Buffer.from(header), Buffer.from(token)) &&
    (!origin || origin === `http://${req.get("host")}`)
  );
}
function rateLimited() {
  times = times.filter((t) => Date.now() - t < 60000);
  return active >= 2 || times.length >= 10;
}
/** Traduz qualquer falha em status + mensagem segura (sem trechos da resposta do modelo). */
function describeError(error: unknown, deadline: AbortSignal) {
  const agentError =
    error instanceof AgentError
      ? error
      : new AgentError(
          "provider",
          "Não foi possível obter uma resposta do agente. Tente novamente.",
        );
  const timedOut = deadline.aborted && agentError.code === "aborted";
  const status = timedOut ? 504 : agentError.status;
  const message = timedOut
    ? "O agente não concluiu a resposta dentro do tempo limite. Tente novamente."
    : agentError.message;
  console.error(
    `[agent] ${agentError.code}${timedOut ? " (prazo total)" : ""}`,
  );
  return { status, message };
}
function respondError(
  res: express.Response,
  error: unknown,
  deadline: AbortSignal,
) {
  const { status, message } = describeError(error, deadline);
  res.status(status).json({ error: message });
}
/** Grafo em NDJSON: uma linha por etapa real e, no fim, `result` ou `error` (o status HTTP já foi 200). */
async function streamAgent(
  res: express.Response,
  input: Parameters<typeof runAgent>[0],
  closed: AbortSignal,
  deadline: AbortSignal,
) {
  const signal = AbortSignal.any([closed, deadline]);
  const send = (event: AgentStreamEvent) => {
    if (!res.writableEnded && !res.destroyed && !closed.aborted)
      res.write(`${JSON.stringify(event)}\n`);
  };
  res.status(200);
  res.setHeader("Content-Type", `${NDJSON_TYPE}; charset=utf-8`);
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  try {
    const reply = await runAgent(input, agentGraph(), {
      signal,
      onStage: (progress) => send({ type: "stage", ...progress }),
    });
    send({ type: "result", reply });
  } catch (error) {
    if (!closed.aborted) {
      const { status, message } = describeError(error, deadline);
      send({ type: "error", status, error: message });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
}
app.post("/api/agent", async (req, res) => {
  if (!authorized(req))
    return res
      .status(403)
      .json({ error: "Acesso inválido. Recarregue o aplicativo." });
  if (!ready())
    return res.status(503).json({
      error:
        "O agente ainda não está conectado. Configure o serviço e tente novamente.",
    });
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Confira o texto, contexto e arquivo enviados." });
  try {
    if (
      ["photo", "exam", "pantry_photo", "shopping_photo", "rotulo"].includes(
        parsed.data.mode,
      )
    ) {
      if (!parsed.data.file) throw new Error();
      mediaPart(
        parsed.data.file,
        parsed.data.mode === "exam" ? "exam" : "photo",
      );
    }
  } catch {
    return res
      .status(400)
      .json({ error: "Arquivo inválido. Confira o formato e o tamanho." });
  }
  if (rateLimited())
    return res
      .status(429)
      .json({ error: "Aguarde um momento antes de enviar outra solicitação." });
  times.push(Date.now());
  active++;
  const closed = new AbortController();
  const abort = () => {
    if (!res.writableEnded) closed.abort();
  };
  res.on("close", abort);
  const deadline = AbortSignal.timeout(TOTAL_BUDGET_MS + 5000);
  const { mode } = parsed.data;
  const isScan = mode === "pantry_photo" || mode === "shopping_photo";
  if (!isScan && req.get("accept")?.includes(NDJSON_TYPE)) {
    try {
      await streamAgent(res, parsed.data, closed.signal, deadline);
    } finally {
      active--;
      res.off("close", abort);
    }
    return;
  }
  try {
    const reply = isScan
      ? await scanPantry(
            buildGenerate(),
            mode,
            parsed.data.file!,
            parsed.data.context,
            AbortSignal.any([closed.signal, deadline]),
          )
        : await runAgent(parsed.data, agentGraph(), {
            signal: AbortSignal.any([closed.signal, deadline]),
          });
    if (!closed.signal.aborted) res.json(reply);
  } catch (error) {
    if (!closed.signal.aborted) respondError(res, error, deadline);
  } finally {
    active--;
    res.off("close", abort);
  }
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Recurso não encontrado." }),
);
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
if (production) {
  const dist = path.join(root, "dist");
  // JS, CSS e fontes levam o hash do conteúdo no nome: nunca mudam, então ficam em cache por um ano.
  // Um arquivo ausente (ex.: pedaço de uma versão anterior depois de atualizar) responde 404, não o
  // index.html; a tela mostra então o aviso com "Recarregar".
  app.use(
    "/assets",
    express.static(path.join(dist, "assets"), {
      immutable: true,
      maxAge: "1y",
      index: false,
    }),
    (_req, res) => res.status(404).type("text/plain").send("Arquivo não encontrado."),
  );
  // O index.html aponta para os arquivos da versão atual: sempre revalida.
  const revalidate = (res: express.Response) =>
    res.setHeader("Cache-Control", "no-cache");
  app.use(
    express.static(dist, {
      setHeaders: (res, file) => {
        if (file.endsWith(".html")) revalidate(res);
      },
    }),
  );
  app.get("*", (_req, res) => {
    revalidate(res);
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) =>
    res
      .status(
        (error as { type?: string }).type === "entity.too.large" ? 413 : 400,
      )
      .json({
        error:
          "Não foi possível processar a solicitação. Confira o tamanho e o formato dos dados.",
      }),
);
const server = app.listen(port, lan ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`WebFit disponível em http://127.0.0.1:${port}`);
  if (!lan) return;
  const urls = lanAddresses().map((ip) => `http://${ip}:${port}`);
  console.log(
    urls.length
      ? `Rede local (use o endereço da sua rede Wi-Fi, em geral 192.168…): ${urls.join("  ")}\nAcesso protegido pelo token de sessão; use --lan apenas em redes confiáveis.`
      : "Rede local: nenhuma interface IPv4 encontrada.",
  );
});
const shutdown = async () => {
  const timeout = setTimeout(() => process.exit(0), 3000);
  timeout.unref();
  server.close();
  server.closeAllConnections();
  await vite?.close();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.on("error", () => {
  console.error(
    "Não foi possível iniciar o WebFit. Confira se a porta está disponível.",
  );
  process.exit(1);
});
