import test from "node:test";
import assert from "node:assert/strict";
import {
  clearState,
  downloadBlob,
  downloadJson,
  exportBackup,
  loadState,
  readFile,
  readLastBackup,
  readPantryPhoto,
  readRaw,
  saveState,
} from "../src/lib/storage";
import { initialState } from "../src/lib/domain";
import { stateFixture } from "./fixtures";
import { withGlobals } from "./fixtures";

/**
 * IndexedDB mínimo o bastante para o padrão de storage.ts: um banco, um object store
 * ("state"), chave fixa ("current"). Persiste em memória por instância (`makeFakeIndexedDB()`),
 * então cada teste que precisa de estado isolado cria a sua.
 */
type Handler = (() => void) | null;
interface FakeRequest {
  onupgradeneeded: Handler;
  onsuccess: Handler;
  onerror: Handler;
  result: unknown;
}
interface FakeGetRequest {
  onsuccess: Handler;
  onerror: Handler;
  result: unknown;
}

function makeTransaction(storesForDb: Map<string, Map<string, unknown>>, storeName: string) {
  const store = storesForDb.get(storeName);
  if (!store) throw new Error(`fake indexedDB: sem object store "${storeName}"`);
  let pending = 0;
  let aborted = false;
  let settled = false;
  const tx = {
    oncomplete: null as Handler,
    onabort: null as Handler,
    onerror: null as Handler,
    abort: () => {
      aborted = true;
      settle();
    },
    objectStore: (name: string) => {
      if (name !== storeName) throw new Error(`fake indexedDB: object store inesperado ${name}`);
      return {
        get: (key: string): FakeGetRequest => {
          const request: FakeGetRequest = { onsuccess: null, onerror: null, result: undefined };
          pending++;
          queueMicrotask(() => {
            request.result = structuredClone(store.get(key));
            request.onsuccess?.();
            pending--;
            queueMicrotask(settle);
          });
          return request;
        },
        put: (value: unknown, key: string) => void store.set(key, structuredClone(value)),
        clear: () => void store.clear(),
      };
    },
  };
  function settle() {
    if (settled || pending > 0) return;
    settled = true;
    if (aborted) tx.onabort?.();
    else tx.oncomplete?.();
  }
  // Sem nenhum get() pendente (ex.: clearState), completa no próximo ciclo mesmo assim.
  queueMicrotask(() => queueMicrotask(settle));
  return tx;
}

function makeFakeIndexedDB() {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();
  return {
    open: (name: string): FakeRequest => {
      const request: FakeRequest = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: undefined,
      };
      queueMicrotask(() => {
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, new Map());
        const storesForDb = databases.get(name);
        if (!storesForDb) throw new Error("fake indexedDB: banco não encontrado");
        const db = {
          createObjectStore: (storeName: string) => void storesForDb.set(storeName, new Map()),
          transaction: (storeName: string) => makeTransaction(storesForDb, storeName),
          close: () => {},
          onversionchange: null as Handler,
        };
        request.result = db;
        if (isNew) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

/** Roda `run` com um IndexedDB de mentira instalado (e devolve o global de antes ao final). */
function withFakeIndexedDB<T>(run: () => Promise<T>): Promise<T> {
  return withGlobals({ indexedDB: makeFakeIndexedDB() }, run);
}

function withStorage(storage: unknown, run: () => void) {
  withGlobals({ localStorage: storage }, run);
}

test("saveState/loadState: primeira revisão salva e volta igual; clearState esvazia", async () => {
  await withFakeIndexedDB(async () => {
    assert.equal(await loadState(), null);
    const state = { ...stateFixture(), revision: 1 };
    await saveState(state);
    const loaded = await loadState();
    assert.deepEqual(loaded, state);
    await clearState();
    assert.equal(await loadState(), null);
  });
});

test("readRaw: sem gravação devolve undefined (loadState o transforma em null)", async () => {
  await withFakeIndexedDB(async () => {
    assert.equal(await readRaw(), undefined);
  });
});

test("saveState: recusa revisão que não avança em 1 ou troca de usuário, sempre como conflito de aba", async () => {
  await withFakeIndexedDB(async () => {
    await assert.rejects(
      () => saveState({ ...stateFixture(), revision: 2 }),
      /outra aba/,
    );
    const state = { ...stateFixture(), revision: 1 };
    await saveState(state);
    await assert.rejects(
      () => saveState({ ...state, revision: 3 }),
      /outra aba/,
    );
    await assert.rejects(
      () => saveState({ ...state, userId: "outro-usuario", revision: 2 }),
      /outra aba/,
    );
    // depois de recusas, o estado salvo continua o mesmo (revisão 1)
    assert.equal((await loadState())?.revision, 1);
    await saveState({ ...state, revision: 2 });
    assert.equal((await loadState())?.revision, 2);
  });
});

test("abrir o banco local sem permissão sobe mensagem amigável (loadState e saveState)", async () => {
  const failingIndexedDB = {
    open: (): FakeRequest => {
      const request: FakeRequest = { onupgradeneeded: null, onsuccess: null, onerror: null, result: undefined };
      queueMicrotask(() => request.onerror?.());
      return request;
    },
  };
  await withGlobals({ indexedDB: failingIndexedDB }, async () => {
    await assert.rejects(() => loadState(), /não permitiu abrir/);
    await assert.rejects(
      () => saveState({ ...stateFixture(), revision: 1 }),
      /não permitiu abrir/,
    );
  });
});

// ---------------------------------------------------------------------------
// downloadJson / downloadBlob / backup local (localStorage + <a> de download)
// ---------------------------------------------------------------------------

interface FakeAnchor {
  href: string;
  download: string;
  clicked: boolean;
  click: () => void;
  remove: () => void;
}

function makeFakeDocument() {
  const body = { children: [] as unknown[] };
  const anchors: FakeAnchor[] = [];
  const doc = {
    createElement: (tag: string) => {
      if (tag !== "a") throw new Error(`fake document: tag inesperada ${tag}`);
      const anchor: FakeAnchor = {
        href: "",
        download: "",
        clicked: false,
        click: () => {
          anchor.clicked = true;
        },
        remove: () => {
          body.children = body.children.filter((child) => child !== anchor);
        },
      };
      anchors.push(anchor);
      return anchor;
    },
    body: {
      append: (element: unknown) => void body.children.push(element),
      get children() {
        return body.children;
      },
    },
  };
  return { doc, anchors, body };
}

/** Espiona URL.createObjectURL/revokeObjectURL sem perder o comportamento real do Node. */
function withUrlSpies<T>(run: (calls: { created: string[]; revoked: string[] }) => T): T {
  const created: string[] = [];
  const revoked: string[] = [];
  const originalCreate = URL.createObjectURL.bind(URL);
  const originalRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob: Blob) => {
    const url = originalCreate(blob);
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
    originalRevoke(url);
  };
  try {
    return run({ created, revoked });
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
}

test("downloadBlob: cria o link com o nome certo, clica, remove da página e só libera a URL depois de 1s", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { doc, anchors, body } = makeFakeDocument();
  withUrlSpies(({ created, revoked }) => {
    withGlobals({ document: doc }, () => {
      downloadBlob(new Blob(["conteúdo"], { type: "text/plain" }), "arquivo.json");
    });
    const anchor = anchors[0];
    assert.equal(anchor.download, "arquivo.json");
    assert.equal(anchor.href, created[0]);
    assert.equal(anchor.clicked, true);
    assert.deepEqual(body.children, []);
    assert.deepEqual(revoked, []);
    t.mock.timers.tick(999);
    assert.deepEqual(revoked, []);
    t.mock.timers.tick(1);
    assert.deepEqual(revoked, created);
  });
});

test("downloadJson: serializa com indentação e baixa como um Blob application/json", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { doc, anchors } = makeFakeDocument();
  withGlobals({ document: doc }, () => {
    downloadJson({ ok: true, n: 2 }, "dados.json");
  });
  assert.equal(anchors[0]?.download, "dados.json");
  assert.equal(anchors[0]?.clicked, true);
});

test("readLastBackup: devolve o valor salvo, ou null quando vazio ou o armazenamento está bloqueado", () => {
  withStorage({ getItem: () => "2026-01-02T00:00:00.000Z" }, () =>
    assert.equal(readLastBackup(), "2026-01-02T00:00:00.000Z"),
  );
  withStorage({ getItem: () => null }, () => assert.equal(readLastBackup(), null));
  withStorage(
    {
      getItem: () => {
        throw new Error("SecurityError");
      },
    },
    () => assert.equal(readLastBackup(), null),
  );
});

test("exportBackup: baixa o backup e grava a data de hoje; se o armazenamento falhar, baixa mesmo assim", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { doc, anchors } = makeFakeDocument();
  const saved = new Map<string, string>();
  withGlobals({ document: doc, localStorage: { setItem: (k: string, v: string) => void saved.set(k, v) } }, () => {
    exportBackup({ ...stateFixture(), revision: 1 }, "backup.json");
  });
  assert.equal(anchors[0]?.clicked, true);
  const stamp = saved.get("webfit-last-backup");
  assert.match(stamp ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const { doc: doc2, anchors: anchors2 } = makeFakeDocument();
  withGlobals(
    {
      document: doc2,
      localStorage: {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    },
    () => exportBackup({ ...stateFixture(), revision: 1 }, "backup.json"),
  );
  assert.equal(anchors2[0]?.clicked, true);
});

// ---------------------------------------------------------------------------
// readFile: anexos genéricos (PDF/JPG/PNG/WebP) via FileReader
// ---------------------------------------------------------------------------

interface FakeBlobLike {
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

class FakeFileReader {
  result: string | null = null;
  onload: Handler = null;
  onerror: Handler = null;
  readAsDataURL(file: FakeBlobLike) {
    file
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.();
      })
      .catch(() => this.onerror?.());
  }
}

function fakeBlobFile(type: string, sizeBytes: number, failsToRead = false): FakeBlobLike {
  const bytes = new Uint8Array(sizeBytes);
  return {
    type,
    size: sizeBytes,
    arrayBuffer: () =>
      failsToRead ? Promise.reject(new Error("leitura falhou")) : Promise.resolve(bytes.buffer),
  };
}

/** Um File real (não a dublê acima): readPantryPhoto passa o arquivo para URL.createObjectURL,
 * que no Node exige uma instância verdadeira de Blob. */
function realFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], "foto", { type });
}

test("readFile: aceita um tipo permitido dentro do limite e devolve a data URL", async () => {
  await withGlobals({ FileReader: FakeFileReader }, async () => {
    const file = fakeBlobFile("application/pdf", 10);
    const result = await readFile(file as unknown as File, 1024, ["application/pdf"]);
    assert.match(result, /^data:application\/pdf;base64,/);
  });
});

test("readFile: recusa formato fora da lista permitida", async () => {
  await withGlobals({ FileReader: FakeFileReader }, async () => {
    const file = fakeBlobFile("image/gif", 10);
    await assert.rejects(
      () => readFile(file as unknown as File, 1024, ["application/pdf", "image/jpeg"]),
      /Formato não aceito/,
    );
  });
});

test("readFile: recusa arquivo maior que o limite, com o limite em MB na mensagem", async () => {
  await withGlobals({ FileReader: FakeFileReader }, async () => {
    const file = fakeBlobFile("application/pdf", 6 * 1024 * 1024);
    await assert.rejects(
      () => readFile(file as unknown as File, 5 * 1024 * 1024, ["application/pdf"]),
      /no máximo 5 MB/,
    );
  });
});

test("readFile: erro de leitura do navegador sobe mensagem amigável", async () => {
  await withGlobals({ FileReader: FakeFileReader }, async () => {
    const file = fakeBlobFile("application/pdf", 10, true);
    await assert.rejects(
      () => readFile(file as unknown as File, 1024, ["application/pdf"]),
      /Não foi possível ler o arquivo/,
    );
  });
});

// ---------------------------------------------------------------------------
// readPantryPhoto: fotos da despensa/geladeira (Image + canvas)
// ---------------------------------------------------------------------------

interface FakeCanvasContext {
  fillStyle: string;
  fillRect: (...args: number[]) => void;
  drawImage: (...args: unknown[]) => void;
}

interface PhotoEnvOptions {
  width?: number;
  height?: number;
  decodeError?: Error;
  context?: FakeCanvasContext | null;
  dataUrl?: string;
}

function withPhotoEnv<T>(options: PhotoEnvOptions, run: () => Promise<T>): Promise<T> {
  class FakeImage {
    src = "";
    naturalWidth = options.width ?? 800;
    naturalHeight = options.height ?? 600;
    decode(): Promise<void> {
      return options.decodeError ? Promise.reject(options.decodeError) : Promise.resolve();
    }
  }
  const context: FakeCanvasContext | null =
    options.context !== undefined
      ? options.context
      : { fillStyle: "", fillRect: () => {}, drawImage: () => {} };
  const doc = {
    createElement: (tag: string) => {
      if (tag !== "canvas") throw new Error(`fake document: tag inesperada ${tag}`);
      return {
        width: 0,
        height: 0,
        getContext: (kind: string) => (kind === "2d" ? context : null),
        toDataURL: () => options.dataUrl ?? "data:image/jpeg;base64,QUFB",
      };
    },
  };
  return withGlobals({ Image: FakeImage, document: doc }, run);
}

test("readPantryPhoto: reduz e devolve a foto como data URL JPEG", async () => {
  await withPhotoEnv({ width: 3200, height: 2400 }, async () => {
    const file = realFile("image/jpeg", 1024);
    const result = await readPantryPhoto(file);
    assert.match(result, /^data:image\/jpeg;base64,/);
  });
});

test("readPantryPhoto: recusa formato fora de JPG/PNG/WebP e foto maior que 20 MB", async () => {
  await withPhotoEnv({}, async () => {
    const badType = fakeBlobFile("image/gif", 1024) as unknown as File;
    await assert.rejects(() => readPantryPhoto(badType), /JPG, PNG ou WebP/);
    const tooBig = fakeBlobFile("image/jpeg", 21 * 1024 * 1024) as unknown as File;
    await assert.rejects(() => readPantryPhoto(tooBig), /até 20 MB/);
  });
});

test("readPantryPhoto: falha ao decodificar a imagem sobe mensagem genérica (sem 'foto' no erro original)", async () => {
  await withPhotoEnv({ decodeError: new Error("boom") }, async () => {
    const file = realFile("image/png", 1024);
    await assert.rejects(() => readPantryPhoto(file), /Não foi possível abrir a imagem/);
  });
});

test("readPantryPhoto: sem contexto 2d disponível, sobe a mensagem original (contém 'foto')", async () => {
  await withPhotoEnv({ context: null }, async () => {
    const file = realFile("image/png", 1024);
    await assert.rejects(() => readPantryPhoto(file), /Não foi possível preparar a foto/);
  });
});

test("readPantryPhoto: resultado grande demais mesmo reduzido sobe aviso para fotografar área menor", async () => {
  const hugeDataUrl = `data:image/jpeg;base64,${"A".repeat(3 * 1024 * 1024)}`;
  await withPhotoEnv({ dataUrl: hugeDataUrl }, async () => {
    const file = realFile("image/png", 1024);
    await assert.rejects(() => readPantryPhoto(file), /área menor/);
  });
});

test("bônus: initialState() sozinho nunca é uma gravação válida sem revisão 1 (documenta a regra de saveState)", () => {
  assert.notEqual(initialState().revision, 1);
});
