/**
 * Administração das contas do WebFit online (no servidor, com DATABASE_URL apontando para o banco):
 *
 *   npm run admin -- invite ["Nome ou nota"] [--dias 14]   código de convite para mandar a alguém
 *   npm run admin -- reset <email>                         código para a pessoa redefinir a senha (24 h)
 *   npm run admin -- owner <email>                         dono do servidor (sem limite de IA)
 *   npm run admin -- member <email>                        volta a ser conta comum
 *   npm run admin -- disable <email> | enable <email>      bloqueia (encerra as sessões) ou libera
 *   npm run admin -- list                                  contas e pedidos de IA de hoje
 *
 * Na VPS: docker compose exec app npm run admin -- invite "Maria"
 * Os códigos aparecem só aqui, uma vez; o banco guarda apenas o hash.
 */
import { config } from "dotenv";
import { databaseTarget, withClient } from "../server/db/client";
import {
  createInvite,
  createPasswordReset,
  INVITE_DAYS,
  listAccounts,
  RESET_HOURS,
  setDisabled,
  setRole,
} from "../server/auth/repo";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const USAGE = `Uso: npm run admin -- <comando>
  invite ["nota"] [--dias N]   gera um código de convite
  reset <email>                gera um código de redefinição de senha
  owner <email> | member <email>
  disable <email> | enable <email>
  list`;

async function main(args: string[]) {
  const [command, ...rest] = args;
  const url = databaseTarget().url;
  const fail = (message: string) => {
    console.error(message);
    process.exitCode = 1;
  };
  await withClient(url, async (client) => {
    switch (command) {
      case "invite": {
        const daysFlag = rest.indexOf("--dias");
        const days = daysFlag >= 0 ? Number(rest[daysFlag + 1]) : INVITE_DAYS;
        if (!Number.isInteger(days) || days < 1 || days > 365) return fail("--dias precisa ser um número de 1 a 365.");
        const note = rest.filter((_, i) => daysFlag < 0 || (i !== daysFlag && i !== daysFlag + 1)).join(" ");
        const code = await createInvite(client, note, days);
        console.log(`Convite${note ? ` para ${note}` : ""} (vale ${days} dias, uma conta):\n\n  ${code}\n`);
        return;
      }
      case "reset": {
        const code = await createPasswordReset(client, rest[0] ?? "");
        if (!code) return fail("Nenhuma conta com este e-mail.");
        console.log(`Código de redefinição (vale ${RESET_HOURS} horas, uma vez):\n\n  ${code}\n`);
        console.log('A pessoa usa em "Esqueci minha senha" na tela de entrada.');
        return;
      }
      case "owner":
      case "member":
        if (!(await setRole(client, rest[0] ?? "", command))) return fail("Nenhuma conta com este e-mail.");
        console.log(command === "owner" ? "Conta definida como dona do servidor." : "Conta definida como comum.");
        return;
      case "disable":
      case "enable":
        if (!(await setDisabled(client, rest[0] ?? "", command === "disable")))
          return fail("Nenhuma conta com este e-mail.");
        console.log(command === "disable" ? "Conta bloqueada e sessões encerradas." : "Conta liberada.");
        return;
      case "list": {
        const rows = await listAccounts(client);
        if (!rows.length) return console.log("Nenhuma conta ainda. Gere um convite com: npm run admin -- invite");
        console.table(
          rows.map((r) => ({
            email: r.email,
            nome: r.name,
            papel: r.role === "owner" ? "dono" : "comum",
            situação: r.disabled ? "bloqueada" : "ativa",
            criada: r.created_at.toISOString().slice(0, 10),
            "IA hoje": r.ai_today,
          })),
        );
        return;
      }
      default:
        return fail(USAGE);
    }
  });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha desconhecida.");
  process.exitCode = 1;
});
