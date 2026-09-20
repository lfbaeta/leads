# Fase 03 — Supabase real e autenticação

## Banco real

O projeto Supabase `leads` foi identificado como o banco de produção atual.

As migrations 001 a 004 foram aplicadas no projeto real antes desta fase.

## Modelo de autenticação

A autenticação continua independente do Lovable e não usa credenciais administrativas no frontend.

Fluxo:

```
Frontend -> POST /auth/login -> API -> users + auth_sessions
Frontend -> Bearer token     -> API -> auth_sessions -> user + organization
```

## Senhas

As senhas são armazenadas usando `scrypt` do Node.js com:

- salt aleatório por senha;
- chave derivada de 64 bytes;
- comparação com `timingSafeEqual`.

O sistema nunca armazena a senha original.

## Sessões

`auth_sessions` armazena somente SHA-256 do token opaco.

Campos principais:

- organization_id;
- user_id;
- token_hash;
- user_agent;
- ip_address;
- expires_at;
- last_seen_at;
- revoked_at.

O token original só é devolvido ao cliente no login.

## Rotas

### POST /auth/login

Body:

```json
{
  "email": "usuario@example.com",
  "password": "senha"
}
```

Possui rate limit específico de 10 tentativas por minuto por origem.

### GET /auth/me

Requer:

```
Authorization: Bearer <token>
```

Retorna usuário, papel e organização.

### POST /auth/logout

Revoga a sessão atual no banco.

## Papéis

Nesta fase existem:

- `ADMIN`;
- `ATTENDANT`.

A função `requireRole()` será usada nas rotas administrativas.

## Primeiro administrador

Nenhuma senha padrão é criada.

Configure somente no ambiente seguro:

```env
INITIAL_ORG_NAME=Leads
INITIAL_ORG_SLUG=leads
INITIAL_ADMIN_NAME=Seu Nome
INITIAL_ADMIN_EMAIL=seu@email.com
INITIAL_ADMIN_PASSWORD=sua-senha-forte
```

Depois execute:

```bash
npm run bootstrap:admin
```

O bootstrap:

1. cria ou reutiliza a organização pelo slug;
2. recusa sobrescrever um administrador existente;
3. gera o hash da senha na aplicação;
4. cria o primeiro usuário como `ADMIN`.

## Hardening incluído

A migration 005 também:

- fixa o `search_path` da função `set_updated_at`;
- adiciona índices nas chaves estrangeiras apontadas pelo advisor;
- habilita RLS em `auth_sessions`.

Não existem policies públicas porque o acesso às tabelas do CRM continua exclusivamente pelo backend.

## Variáveis

`SESSION_TTL_HOURS` controla a duração da sessão e aceita de 1 a 168 horas.

## Regra de segurança

Nunca colocar no GitHub:

- `DATABASE_URL` real;
- senha do administrador;
- token de sessão;
- chaves secretas de APIs.
