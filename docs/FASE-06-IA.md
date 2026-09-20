# Fase 06 — IA e atendimento automático

A IA permanece desacoplada do WhatsApp por meio de `AIProvider`. Esta fase implementa regras, contexto, prompts, debounce e transferência humana sem escolher ou simular um provedor externo.

## Regra de entrada

A IA só deve ser acionada depois de uma mensagem recebida do lead. A primeira abordagem continua sendo responsabilidade da campanha.

`registerInboundForAI()` recebe uma mensagem inbound já persistida pelo futuro webhook, classifica regras determinísticas e agenda um job `AI_REPLY` apenas quando:

- IA está habilitada;
- conversa está em modo AI;
- AI não está pausada;
- não houve opt-out;
- não foi classificado como sem interesse.

## Debounce

A chave de job é uma por conversa. Novas mensagens recebidas antes da resposta movem o mesmo job para frente. Isso reduz respostas quebradas quando o cliente envia várias mensagens curtas seguidas.

## Regras antes do modelo

Opt-out, pedido de humano e classificações simples não dependem do LLM.

Opt-out explícito:

- grava `opt_outs`;
- marca o lead `DO_NOT_CONTACT`;
- impede job de IA.

Pedido de humano:

- muda a conversa para `HUMAN`;
- pausa a IA;
- cancela o debounce daquela conversa.

## Prompts

Existem duas camadas:

1. prompt de sistema imutável no código com regras de segurança;
2. prompt comercial versionado e editável pelo ADMIN.

O prompt editável não substitui as regras imutáveis.

## Contexto

`generateAIReply()` lê somente mensagens da mesma organização e conversa, limitado por `max_history_messages`.

## Rotas

- `GET /ai/settings`;
- `PUT /ai/settings` — ADMIN;
- `GET /ai/prompts`;
- `POST /ai/prompts` — ADMIN;
- `POST /conversations/:id/takeover`;
- `POST /conversations/:id/return-to-ai`.

## Limite intencional

Ainda não existe chamada para OpenAI/Gemini/etc. nem envio de resposta para WhatsApp. O provider será conectado depois, mantendo a regra de nunca marcar como enviado sem confirmação externa.
