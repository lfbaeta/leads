# Leads CRM

CRM de prospeccao e atendimento com arquitetura independente do Lovable.

## Estado atual

**Fases estruturais 01–09 implementadas no backend. Ativação de providers externos exige configuração e teste controlado.**

O Supabase e o PostgreSQL escolhido para o projeto, mas o nucleo usa `DATABASE_URL` e SQL PostgreSQL comum. O frontend/Lovable nao acessa o banco diretamente.

WhatsApp possui adapter/worker e webhooks; IA possui regras e contrato de provider. Credenciais e providers reais permanecem desativados até configuração segura.

## Arquitetura

```
Frontend React / Lovable
          |
          v
      API Fastify
          |
          +------ PostgreSQL / Supabase
          |
          +------ Worker independente
          |
          +------ WhatsAppProvider (Evolution API / Go)
          +------ AIProvider       (desacoplado)
          +------ StorageProvider  (desacoplado)
```

### Regra critica

Disparos programados pertencem ao backend/worker. Fechar navegador, Lovable ou computador do operador nao pode interromper a fila.

## Estrutura

- `src/api` — API HTTP.
- `src/config` — ambiente validado.
- `src/db` — conexao PostgreSQL.
- `src/domain` — regras reutilizaveis.
- `src/providers` — contratos desacoplados.
- `src/queue` — fila persistente.
- `src/worker` — processo em background.
- `db/migrations` — schema versionado.
- `scripts` — utilitarios administrativos.
- `tests` — testes automatizados.
- `docs` — documentacao tecnica.

## Banco

As migrations iniciais criam estruturas para:

- organizacoes e usuarios;
- instancias;
- leads e tags;
- campanhas;
- conversas;
- mensagens e anexos;
- fila persistente;
- webhooks idempotentes;
- importacoes;
- IA/prompts/arquivos;
- opt-out;
- configuracoes;
- auditoria;
- heartbeat do worker.

O telefone normalizado e protegido por unicidade dentro de cada organizacao. Jobs usam `idempotency_key` unica.

## Configuracao local

Requer Node.js 20 ou superior.

```bash
npm install
cp .env.example .env
```

Preencha no `.env` pelo menos:

```env
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

Nunca envie o `.env` ao GitHub.

## Banco / migrations

```bash
npm run db:migrate
```

Veja `docs/SUPABASE.md`.

## Desenvolvimento

API:

```bash
npm run dev:api
```

Worker:

```bash
npm run dev:worker
```

## Validacao

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

O mesmo conjunto roda automaticamente no GitHub Actions.

## Health check

```
GET /health
```

Retorna o estado da API, banco e worker. IA, WhatsApp e storage permanecem `NOT_CONFIGURED` ate suas respectivas fases.

## Seguranca

- nenhum segredo real versionado;
- RLS habilitado nas tabelas da aplicacao;
- frontend sem acesso direto ao banco nesta fase;
- logs preparados para ocultar campos sensiveis;
- rate limit e CORS no backend;
- opt-out estruturado no banco;
- fila com locks transacionais;
- webhooks com protecao estrutural de duplicidade;
- `DRY_RUN=true` por padrao.

## Documentacao

- `docs/ARQUITETURA.md`
- `docs/SUPABASE.md`
- `docs/FASE-01-FUNDACAO.md`

## Produção

Consulte `docs/FASE-09-REVISAO-FINAL.md`. O projeto deve manter API e worker hospedados continuamente. `DRY_RUN=true` permanece o padrão seguro até o teste real do WhatsApp.
