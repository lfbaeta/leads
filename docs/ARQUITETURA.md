# Arquitetura do Leads CRM

## Principio

O Lovable e uma camada de frontend/administracao. Dados e rotinas criticas pertencem ao backend, PostgreSQL e worker.

A aplicacao deve continuar migravel mesmo se o frontend deixar de utilizar Lovable.

## Componentes do MVP

### Frontend

- React + TypeScript.
- Responsivo.
- Consome apenas APIs do backend.
- Nao recebe credenciais privadas.
- Nao processa filas em background.

### API

- Node.js + TypeScript.
- Fastify.
- Validacao centralizada de ambiente.
- CORS e rate limit.
- Logs estruturados.
- Tratamento de erro sem expor stack trace ao cliente.
- Health check em `/health`.

### PostgreSQL

Host atual: Supabase.

O acesso principal e por `DATABASE_URL`, usando `pg`, sem dependencia do SDK do Supabase.

Migrations ficam em `db/migrations` e sao controladas pela tabela `schema_migrations`.

### Worker

Processo independente da API e do frontend.

Responsabilidades previstas:

- heartbeat;
- recuperacao de jobs travados;
- reserva atomica de jobs;
- disparos de WhatsApp;
- retries;
- debounce de conversas;
- tarefas de IA;
- rotinas agendadas.

Na Fase 01 apenas heartbeat e recuperacao segura estao ativos. Envio real entra quando houver provider implementado.

## Fila persistente

Tabela principal: `message_jobs`.

Protecoes estruturais:

- `idempotency_key` unica por organizacao;
- estados persistidos;
- tentativas e maximo de tentativas;
- `locked_at` e `locked_by`;
- reserva com `FOR UPDATE SKIP LOCKED`;
- recuperacao de job preso;
- `available_at` para reagendamento/backoff.

O browser nao participa do processamento.

## Multiempresa

As entidades principais recebem `organization_id`.

O MVP comeca com uma organizacao, mas a estrutura evita mistura futura de dados entre empresas. As rotas de negocio deverao sempre filtrar pelo contexto autenticado da organizacao.

## Seguranca de banco

RLS fica habilitado nas tabelas de aplicacao sem policies de frontend nesta fase. Isso reforca a decisao arquitetural de nao acessar dados do CRM diretamente pelo Data API.

O backend deve usar uma conexao de servidor autorizada e validar permissoes por usuario/organizacao.

## Providers

Contratos definidos em `src/providers/contracts.ts`:

### WhatsAppProvider

Devera encapsular Evolution API e Evolution Go.

### AIProvider

Devera encapsular o provedor de IA.

### StorageProvider

Devera permitir S3/compatibles sem espalhar dependencia de fornecedor.

## Idempotencia

### Jobs

Unicidade por `organization_id + idempotency_key`.

### Webhooks

Unicidade por `instance_id + external_event_id`.

### Mensagens externas

Unicidade por organizacao, instancia e `external_message_id`.

A camada de provider ainda devera confirmar o resultado externo antes de qualquer retry de envio.

## Opt-out

Existe tabela global por organizacao + telefone normalizado e flag no lead.

Antes de enfileirar e antes de enviar, o backend devera validar opt-out. Essa regra sera implementada na etapa de campanhas/worker e nunca ficara somente no frontend.

## Datas e timezone

Datas criticas sao armazenadas como `timestamptz`.

A configuracao padrao e `America/Sao_Paulo`, mas o processamento nao depende do relogio do navegador.

## Migrations e portabilidade

O Supabase e fornecedor atual, nao requisito de negocio.

Para migrar:

1. backup do PostgreSQL;
2. restauracao em outro PostgreSQL;
3. alteracao da `DATABASE_URL`;
4. aplicacao das migrations restantes;
5. testes e health check.

## Regra de implementacao

Nenhuma tela deve aparentar que uma integracao esta funcionando antes de existir implementacao real no backend. Recursos pendentes devem ser identificados como nao configurados.
