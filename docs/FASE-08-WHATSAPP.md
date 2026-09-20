# Fase 08 — WhatsApp / Evolution

Integração desacoplada por `WhatsAppProvider`, com perfis Evolution API e Evolution Go configuráveis por instância.

## Segurança
- API keys e segredos de webhook são criptografados AES-256-GCM com `ENCRYPTION_KEY`.
- Webhook exige `x-webhook-secret`; somente SHA-256 é usado para validação.
- Credenciais não são retornadas pela API.
- Eventos possuem chave externa única por instância.

## Worker
Com `DRY_RUN=true`, nenhum envio externo ocorre. Em produção, o worker busca `WHATSAPP_SEND`, chama o provider e somente marca `SENT` depois de receber `externalMessageId`. Falhas usam backoff e limite de tentativas.

## Inbound
O webhook normaliza o evento, deduplica, localiza o lead pelo telefone, cria/atualiza a conversa, persiste a mensagem recebida e então aciona as regras da IA.

## Importante
Endpoints específicos podem variar entre versões/forks de Evolution. Antes de ativar produção, valide a versão declarada da instância e faça teste real de conexão/envio em DRY_RUN=false num número de teste. O sistema não assume sucesso sem ID externo.
