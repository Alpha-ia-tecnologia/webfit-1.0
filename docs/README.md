# Documentação do WebFit

| Pasta / documento | Responsabilidade |
| --- | --- |
| [guias/github.md](guias/github.md) | Primeiro envio, arquivos ignorados e revisão do repositório |
| [guias/producao.md](guias/producao.md) | Execução compilada e requisitos ainda pendentes para acesso público |
| [guias/sistema.md](guias/sistema.md) | Funcionalidades, IA, banco, testes e padrões visuais |
| [guias/testes.md](guias/testes.md) | Unitários, E2E na porta 3107, verificação visual nos dois temas e verificações do app nativo |
| [guias/tokens-e-tema.md](guias/tokens-e-tema.md) | Tokens visuais, tema escuro no web, guardas de CSS e como ligar o escuro no app |
| [guias/ia-estruturada.md](guias/ia-estruturada.md) | Saídas estruturadas do agente: registro de especificações, laudos e reserva em texto |
| [guias/viz.md](guias/viz.md) | Gramática de gráficos: formas, cores, acessibilidade e movimento |
| [planejamento/plano-app.md](planejamento/plano-app.md) | Plano de evolução; não representa funcionalidades já entregues |
| [historico/ondas-2-3.md](historico/ondas-2-3.md) | Modernização visual (Ondas 2 e 3), última verificação e decisões pendentes |
| [historico/retomada.md](historico/retomada.md) | Registro histórico de trabalho e verificações anteriores |
| [../mobile/README.md](../mobile/README.md) | Instalação, integração e compilação do aplicativo nativo |

## Limites entre projetos

- `src/`: aplicação web; `src/lib/`, `src/data/` e `src/types.ts` também fornecem regras ao mobile.
- `server/`: API, credenciais e chamadas aos provedores de IA. É executado pelo pacote da raiz e serve o build web de `dist/`.
- `mobile/`: pacote Expo independente, com dependências próprias. O alias `@shared/*` aponta para `../src/*`; ele precisa dessa pasta no checkout.
- `tests/`: testes do código da raiz e das regras compartilhadas; `tests/e2e/` contém jornadas do navegador.
- `scripts/`: ferramentas da raiz; `mobile/scripts/` contém as específicas do aplicativo.
- `data-sources/`: arquivos usados para reproduzir a importação do catálogo alimentar. Não é uma pasta de dados pessoais.

O web e a API compartilham o pacote da raiz. Não são três serviços independentes: instalar apenas `server/` ou publicar apenas `dist/` não entrega o sistema completo. Não há npm workspaces; execute `npm ci` na raiz e `npm --prefix mobile ci` para instalar o mobile.

As pastas de código foram preservadas para manter imports, Metro, migrações e scripts Android compatíveis. A documentação foi centralizada aqui; arquivos locais continuam ignorados, sem precisar apagar builds ou dependências da máquina.
