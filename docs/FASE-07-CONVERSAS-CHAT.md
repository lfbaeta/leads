# Fase 07 — Conversas e chat

Esta fase fornece a API do inbox/chat sem acesso direto do frontend ao banco.

## Rotas autenticadas

- `GET /conversations` — lista inbox com lead, última mensagem, modo AI/HUMAN e não lidas;
- `GET /conversations/:id` — detalhes da conversa e lead;
- `GET /conversations/:id/messages` — histórico paginado por cursor;
- `POST /conversations/:id/read` — zera contador de não lidas;
- `POST /conversations/:id/messages` — cria mensagem humana e job persistente.

Os controles `/takeover` e `/return-to-ai` implementados na fase anterior completam o fluxo de assumir/devolver à IA.

## Segurança

Toda consulta inclui `organization_id` da sessão autenticada. IDs enviados pelo frontend nunca definem a organização.

Mensagem manual respeita `DO_NOT_CONTACT` e `opt_out`. Se a conversa não tiver instância WhatsApp, retorna conflito em vez de fingir envio.

## Persistência

A mensagem humana é criada como `QUEUED` e um `message_job` persistente é criado. Fechar o navegador não perde a mensagem. A confirmação `SENT` continuará dependendo do provider real da fase de integração WhatsApp.
