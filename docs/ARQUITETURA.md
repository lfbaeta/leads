# Arquitetura inicial

## Princípio

O Lovable será tratado como camada de criação/manutenção da interface. Os dados críticos não devem depender do banco gerenciado pelo Lovable.

## Camadas

### Frontend
- React + TypeScript
- Interface responsiva
- Autenticação
- Dashboard e telas do CRM

### API / Backend
- Regras de negócio
- Validação dos dados
- Controle de permissões
- Integrações externas
- Comunicação com o banco
- Nunca expor credenciais privadas ao frontend

### Banco de dados
Preferência por PostgreSQL externo em conta controlada pelo proprietário, por exemplo:
- Supabase próprio
- Neon
- Outro PostgreSQL compatível

### Worker / Fila
Responsável por processos que precisam continuar mesmo com a página fechada:
- mensagens agendadas
- tentativas e reenvios
- atualização de status
- processamento de importações
- rotinas periódicas

## Entidades iniciais

- users
- leads
- lead_tags
- imports
- import_rows
- message_templates
- message_queue
- message_attempts
- conversations
- ai_settings
- audit_logs

## Estados iniciais de lead

- novo
- em_contato
- interessado
- aguardando_resposta
- sem_resposta
- convertido
- descartado

## Estados da fila

- agendado
- aguardando
- processando
- enviado
- falhou
- cancelado

## Segurança

- Secrets somente no backend/ambiente seguro.
- Row Level Security quando aplicável.
- Logs de ações importantes.
- Backups do banco.
- Proteção contra disparo duplicado.
- Idempotência nos jobs de envio.

## Próxima etapa

Criar o esqueleto da aplicação e o schema inicial do banco externo antes de integrar automações reais de mensagens.
