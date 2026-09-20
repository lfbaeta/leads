# Fase 05 — Campanhas e fila persistente

## Regra principal

A campanha agenda somente a primeira abordagem automática. A chave de idempotência é determinística por campanha + lead:

`campaign:<campaignId>:lead:<leadId>:initial:v1`

Depois do envio confirmado, o lead da campanha deve ficar em `WAITING_REPLY`. Nenhuma segunda abordagem automática é criada por esta fase.

## API

Rotas autenticadas:

- `GET /campaigns`;
- `POST /campaigns`;
- `POST /campaigns/:id/start`;
- `POST /campaigns/:id/pause`;
- `POST /campaigns/:id/resume`;
- `POST /campaigns/:id/cancel`.

## Agendamento

A campanha suporta:

- data/hora inicial;
- timezone;
- dias permitidos;
- janela de horário;
- intervalo mínimo/máximo aleatório;
- intervalo fixo opcional.

O agendamento acontece no backend e cria `message_jobs` persistentes. Fechar navegador ou computador do operador não apaga a fila.

## Segurança e duplicidade

Antes de incluir leads:

- valida organização;
- exclui soft-deleted;
- exclui `opt_out=true`;
- exclui status `DO_NOT_CONTACT`;
- cruza com `opt_outs`.

O índice e a chave de idempotência impedem recriar o mesmo job inicial da mesma campanha para o mesmo lead.

## Pausa

O claim da fila verifica se a campanha está `RUNNING`. Assim jobs agendados de campanha pausada não são consumidos.

## Limite desta fase

Ainda não há chamada real ao WhatsApp. O worker continua sem provider externo até a fase Evolution API/Evolution Go. Isso evita simular envio ou marcar mensagem como enviada sem confirmação do provedor.

A próxima implementação da fila deverá, ao receber confirmação real do provider:

1. atualizar `messages` com external_message_id;
2. marcar o job como `SENT`;
3. marcar `campaign_leads` como `WAITING_REPLY`;
4. atualizar contadores da campanha;
5. manter reconciliação para reduzir risco de duplicidade em falhas entre provider e commit local.
