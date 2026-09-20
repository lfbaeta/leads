# Fase 09 — Painel, configuração e revisão final

## Estado funcional
O backend possui autenticação própria, PostgreSQL externo, importação, leads, campanhas, fila persistente, IA desacoplada, conversas, chat, providers WhatsApp, webhooks, dashboard, configurações e auditoria.

## Endpoints para o frontend/Lovable
O frontend deve consumir somente a API Fastify. Não use credenciais PostgreSQL, service role ou API key do WhatsApp no navegador.

Principais grupos:
- /auth
- /dashboard
- /leads
- /imports
- /campaigns
- /conversations
- /ai
- /instances
- /settings
- /users
- /audit-logs
- /health

## Checklist antes de produção
1. Hospedar API e worker como processos independentes e sempre ativos.
2. Configurar DATABASE_URL, ENCRYPTION_KEY e demais segredos somente no servidor.
3. Manter DRY_RUN=true durante configuração.
4. Cadastrar uma instância WhatsApp de teste e validar status/webhook.
5. Fazer um único envio controlado; confirmar externalMessageId e atualização SENT.
6. Testar inbound, deduplicação, opt-out e takeover humano.
7. Configurar provider de IA real antes de habilitar ai_settings.enabled.
8. Só então mudar DRY_RUN=false no worker.
9. Configurar backup e monitorar /health, worker_heartbeats e jobs FAILED.

## Pendências externas
O código não pode concluir sozinho configuração de DNS/hospedagem, credenciais reais de WhatsApp, chaves de IA nem configuração visual dentro de um projeto Lovable que ainda não foi conectado. Esses itens exigem os respectivos ambientes/credenciais.

## Regra de segurança
Nenhuma integração externa é considerada pronta apenas porque compila. A ativação exige teste real controlado do provider configurado.
