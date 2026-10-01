import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let files;
try {
  files = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean))];
} catch {
  console.error("Não foi possível ler o Git. Execute git init -b main na raiz ou confira a instalação do Git.");
  process.exit(1);
}

const issues = [];
const report = (file, message) => issues.push(`${file}: ${message}`);
const generatedDirectory = /(^|\/)(node_modules|dist|build|coverage|test-results|playwright-report|blob-report|\.expo|\.gradle|\.kotlin|\.local|\.claude|\.codex|\.idea|\.vscode)(\/|$)/;
const sensitiveFile = /\.(?:pem|key|p12|p8|jks|keystore|mobileprovision|sqlite3?|db(?:-wal|-shm)?|dump|backup|apk|aab|ipa|log)$/i;
const binary = /\.(?:png|jpe?g|webp|gif|ico|xlsx|pdf|wasm|ttf|woff2?)$/i;
// Padrões conhecidos; não imprime o conteúdo que correspondeu à regra.
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/i,
];

for (const file of files) {
  const relative = file.replaceAll("\\", "/");
  const name = path.posix.basename(relative);
  const absolute = path.join(root, file);
  if (generatedDirectory.test(relative) || /^mobile\/(android|ios)\//.test(relative)) {
    report(file, "pasta local ou gerada incluída no repositório");
  }
  if ((name.startsWith(".env") && name !== ".env.example") || sensitiveFile.test(name) || /^(credentials|service-account.*)\.json$/i.test(name)) {
    report(file, "arquivo local, credencial ou artefato que não deve ser publicado");
  }
  if (!existsSync(absolute)) continue; // Arquivos removidos do diretório de trabalho.
  const stat = lstatSync(absolute);
  if (stat.isDirectory()) {
    if (existsSync(path.join(absolute, ".git"))) report(file, "repositório Git aninhado; o código pode não entrar no envio");
    continue;
  }
  if (!stat.isFile()) continue;
  if (stat.size >= 100 * 1024 * 1024) report(file, "arquivo de 100 MiB ou mais; use uma distribuição de artefatos apropriada");
  if (binary.test(name) || stat.size > 5 * 1024 * 1024) continue;
  const content = readFileSync(absolute, "utf8");
  if (secretPatterns.some((pattern) => pattern.test(content))) report(file, "possível credencial no conteúdo; revise antes de publicar");
  if (name === ".env.example") {
    for (const line of content.split(/\r?\n/)) {
      if (/^\s*(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)|DATABASE_URL)\s*=\s*\S/.test(line)) {
        report(file, "modelo de ambiente com valor preenchido em campo de credencial");
        break;
      }
    }
  }
}
for (const entry of git("ls-files", "--stage", "-z").split("\0")) {
  if (entry.startsWith("160000 ")) report(entry.split("\t")[1], "gitlink/submódulo inesperado; este projeto usa um repositório único");
}
if (issues.length) {
  console.error(`Revisão do repositório: ${issues.length} problema(s).`);
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log(`Repositório verificado: ${files.length} arquivos; nenhum problema nas regras locais. Revise o diff antes do commit.`);
}
