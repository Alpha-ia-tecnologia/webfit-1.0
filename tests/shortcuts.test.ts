import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAUNCH_PARAM,
  QUICK_LOG_SHORTCUT,
  isEditableTarget,
  isQuickLogShortcut,
  launchShortcut,
  type ShortcutKeyEvent,
  type ShortcutTarget,
} from "../src/lib/shortcuts";

const key = (value: string, extra: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
  key: value,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  ...extra,
});
const free = { isEditable: false, hasOverlay: false };

test("o atalho do registro rápido é a letra N", () => {
  assert.equal(QUICK_LOG_SHORTCUT, "N");
});

test("n, N e Shift+N abrem o registro rápido", () => {
  assert.equal(isQuickLogShortcut(key("n"), free), true);
  assert.equal(isQuickLogShortcut(key("N"), free), true);
  // Com Shift (ou Caps Lock) o navegador entrega "N": continua valendo.
  assert.equal(isQuickLogShortcut(key("N", {}), free), true);
});

test("modificadores, repetição, composição e eventos já tratados não abrem", () => {
  for (const extra of [
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { repeat: true },
    { isComposing: true },
    { defaultPrevented: true },
  ] satisfies Partial<ShortcutKeyEvent>[])
    assert.equal(isQuickLogShortcut(key("n", extra), free), false, JSON.stringify(extra));
});

test("em campo de digitação ou com diálogo/menu aberto, a letra não abre nada", () => {
  assert.equal(isQuickLogShortcut(key("n"), { isEditable: true, hasOverlay: false }), false);
  assert.equal(isQuickLogShortcut(key("n"), { isEditable: false, hasOverlay: true }), false);
});

test("outras teclas não abrem", () => {
  for (const other of ["m", "b", "Enter", " ", "Escape", "ñ", ""])
    assert.equal(isQuickLogShortcut(key(other), free), false, other);
});

const input = (type?: string): ShortcutTarget => ({ tagName: "INPUT", type });

test("campos de texto contam como digitação; caixas, rádios e controles deslizantes não", () => {
  for (const type of ["text", "email", "number", "search", "tel", "url", "password", "date", "time", undefined])
    assert.equal(isEditableTarget(input(type)), true, String(type));
  for (const type of ["checkbox", "radio", "range", "button", "submit", "reset", "color", "file", "image"])
    assert.equal(isEditableTarget(input(type)), false, type);
  // O tipo vem como o navegador normaliza (minúsculo), mas maiúsculas não enganam.
  assert.equal(isEditableTarget(input("CHECKBOX")), false);
});

test("textarea, select, contenteditable e role=textbox contam como digitação", () => {
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  const insideEditor: ShortcutTarget = {
    tagName: "SPAN",
    closest: (selector) => (selector.includes('[role="textbox"]') ? {} : null),
  };
  assert.equal(isEditableTarget(insideEditor), true);
});

test("botões, o corpo da página e alvo nulo não são campos", () => {
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget({ tagName: "BUTTON" }), false);
  assert.equal(isEditableTarget({ tagName: "BODY", closest: () => null }), false);
  assert.equal(isEditableTarget({}), false);
});

test("atalhos do app instalado: só água, refeição e registro rápido abrem algo", () => {
  assert.equal(LAUNCH_PARAM, "atalho");
  assert.equal(launchShortcut("?atalho=agua"), "agua");
  assert.equal(launchShortcut("?atalho=refeicao"), "refeicao");
  assert.equal(launchShortcut("?x=1&atalho=registro"), "registro");
  // Valor desconhecido (inclusive dose), ausente ou vazio não abre nada.
  for (const search of ["?atalho=dose", "?atalho=AGUA", "?atalho=", "?agua", "?x=1", ""])
    assert.equal(launchShortcut(search), null, search);
});
