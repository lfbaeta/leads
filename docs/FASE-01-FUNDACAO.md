# Fase 01 — Fundacao, banco externo e backend

## Implementado

- Node.js + TypeScript.
- Fastify como API HTTP.
- PostgreSQL via `DATABASE_URL`.
- Compatibilidade com Supabase sem acoplamento ao SDK.
- Executor versionado de migrations.
- Schema inicial multiempresa.
- Leads com telefone original e normalizado.
- Protecao de duplicidade por telefone dentro da organizacao.
- Instancias de WhatsApp preparadas para adapters.
- Campanhas e associacao de leads.
- Conversas e historico completo de mensagens.
- Anexos desacoplados de storage especifico.
- Fila persistente `message_jobs`.
- `idempotency_key` unica por organizacao.
- Reserva de jobs com `FOR UPDATE SKIP LOCKED`.
- Recuperacao de jobs travados.
- Heartbeat do worker.
- Webhooks com chave externa unica por instancia.
- Importacoes e linhas de importacao.
- Estruturas de IA, prompts e arquivos.
- Opt-out global por numero.
- Logs de auditoria.
- Health check.
- Contratos `WhatsAppProvider`, `AIProvider` e `StorageProvider`.
- `DRY_RUN=true` por padrao.
- RLS habilitado como defesa contra acesso direto via Data API.
- Teste unitario inicial de normalizacao de telefone.

## Deliberadamente ainda nao implementado

Esta fase nao simula recursos que ainda nao existem:

- login/autenticacao completa;
- CRUD de leads;
- importacao XLSX/CSV;
- frontend;
- disparo real de WhatsApp;
- Evolution API;
- Evolution Go;
- processamento de webhook real;
- IA real;
- storage real;
- criacao e execucao de campanhas pela interface.

Esses itens entram nas proximas fases.

## Decisoes importantes

### Banco

Supabase e o host atual do PostgreSQL. O codigo usa apenas protocolo PostgreSQL no nucleo.

### Fila

A fila esta no PostgreSQL para manter o MVP simples. A interface do dominio nao depende de BullMQ/Redis.

### Worker

O worker e processo separado da API e do frontend. Fechar o navegador nao o interrompe.

### Dados de demonstracao

Nenhum seed ficticio de producao foi criado.

### Segredos

Nenhum segredo real foi versionado. `.env.example` contem somente nomes de variaveis.
