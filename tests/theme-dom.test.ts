import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTheme,
  getThemePref,
  readThemePref,
  setThemePref,
  subscribeThemePref,
} from "../src/lib/theme-dom";

/** <html> e metas mínimos: só o que applyTheme lê e escreve. */
function fakeDocument() {
  const attrs = new Map<string, string>();
  const meta = (name: string, media: string | null, content: string) => {
    const data = new Map<string, string>([["name", name], ["content", content]]);
    if (media) data.set("media", media);
    return {
      getAttribute: (key: string) => data.get(key) ?? null,
      setAttribute: (key: string, value: string) => void data.set(key, value),
    };
  };
  const scheme = meta("color-scheme", null, "light dark");
  const colors = [
    meta("theme-color", "(prefers-color-scheme: light)", "#00D084"),
    meta("theme-color", "(prefers-color-scheme: dark)", "#0B1220"),
  ];
  const doc = {
    documentElement: {
      setAttribute: (key: string, value: string) => void attrs.set(key, value),
      removeAttribute: (key: string) => void attrs.delete(key),
    },
    querySelector: (selector: string) => (selector.includes("color-scheme") ? scheme : null),
    querySelectorAll: (selector: string) => (selector.includes("theme-color") ? colors : []),
  };
  return {
    doc: doc as unknown as Document,
    theme: () => attrs.get("data-theme") ?? null,
    scheme: () => scheme.getAttribute("content"),
    colors: () => colors.map((m) => m.getAttribute("content")),
  };
}

function withStorage(storage: unknown, run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("applyTheme: escolha explícita fixa data-theme e as metas; Sistema devolve ao CSS", () => {
  const page = fakeDocument();
  applyTheme("escuro", page.doc);
  assert.equal(page.theme(), "dark");
  assert.equal(page.scheme(), "dark");
  assert.deepEqual(page.colors(), ["#0b1220", "#0b1220"]);
  applyTheme("claro", page.doc);
  assert.equal(page.theme(), "light");
  assert.equal(page.scheme(), "light");
  assert.deepEqual(page.colors(), ["#00d084", "#00d084"]);
  applyTheme("sistema", page.doc);
  assert.equal(page.theme(), null);
  assert.equal(page.scheme(), "light dark");
  assert.deepEqual(page.colors(), ["#00d084", "#0b1220"]);
});

test("readThemePref: valor salvo, inválido ou armazenamento bloqueado", () => {
  withStorage({ getItem: () => "escuro" }, () => assert.equal(readThemePref(), "escuro"));
  withStorage({ getItem: () => "dark" }, () => assert.equal(readThemePref(), "sistema"));
  withStorage(
    {
      getItem: () => {
        throw new Error("SecurityError");
      },
    },
    () => assert.equal(readThemePref(), "sistema"),
  );
  withStorage(undefined, () => assert.equal(readThemePref(), "sistema"));
});

test("setThemePref grava, avisa os inscritos e segue mesmo sem armazenamento", () => {
  const saved = new Map<string, string>();
  let calls = 0;
  const stop = subscribeThemePref(() => calls++);
  withStorage({ setItem: (key: string, value: string) => void saved.set(key, value) }, () => {
    setThemePref("claro");
  });
  assert.equal(saved.get("webfit-theme"), "claro");
  assert.equal(getThemePref(), "claro");
  withStorage(
    {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    },
    () => setThemePref("escuro"),
  );
  assert.equal(getThemePref(), "escuro");
  assert.equal(calls, 2);
  stop();
  setThemePref("sistema");
  assert.equal(calls, 2);
});
