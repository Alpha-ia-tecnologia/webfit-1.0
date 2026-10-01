import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchShortcut } from "../src/lib/shortcuts";

/**
 * Manifest do app instalado (HOJE-13): ícones locais em PNG e atalhos que só abrem telas de
 * confirmação. Tudo sai de public/, sem endereço externo.
 */
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const raw = readFileSync(path.join(PUBLIC, "manifest.webmanifest"), "utf8");

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: ManifestIcon[];
  shortcuts: { name: string; short_name: string; url: string }[];
}
const manifest = JSON.parse(raw) as Manifest;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("o manifest abre no início, em janela própria e dentro do app", () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "WebFit");
});

test("cada ícone existe, é PNG e tem o tamanho declarado", () => {
  assert.equal(manifest.icons.length, 3);
  assert.equal(manifest.icons.filter((icon) => icon.purpose === "maskable").length, 1);
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/icons\/[\w-]+\.png$/, icon.src);
    assert.equal(icon.type, "image/png");
    const file = path.join(PUBLIC, icon.src);
    assert.ok(existsSync(file), icon.src);
    const png = readFileSync(file);
    assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE, icon.src);
    assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR", icon.src);
    const [width, height] = icon.sizes.split("x").map(Number);
    assert.equal(png.readUInt32BE(16), width, `${icon.src} largura`);
    assert.equal(png.readUInt32BE(20), height, `${icon.src} altura`);
  }
});

test("os três atalhos abrem confirmações conhecidas, sem dose nem medicação", () => {
  assert.deepEqual(
    manifest.shortcuts.map((s) => launchShortcut(new URL(s.url, "http://x").search)),
    ["agua", "refeicao", "registro"],
  );
  for (const shortcut of manifest.shortcuts) {
    assert.match(shortcut.url, /^\/\?atalho=[a-z]+$/, shortcut.url);
    assert.doesNotMatch(`${shortcut.name} ${shortcut.short_name}`, /dose|aplica|inje|medica|caneta/i);
  }
});

test("o manifest não aponta para nenhum endereço externo", () => {
  assert.doesNotMatch(raw, /http/i);
});
