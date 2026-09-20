# Supabase — uso como PostgreSQL externo

O projeto **Leads** usa o Supabase como hospedagem atual do PostgreSQL, mas a regra de negocio nao depende do SDK do Supabase.

## Regra principal

O frontend nao deve receber a senha do banco, `DATABASE_URL`, service role ou qualquer chave administrativa.

A comunicacao prevista e:

```
Frontend/Lovable -> API Leads -> PostgreSQL/Supabase
                         |
                         -> Worker
```

Isso permite trocar o Supabase por outro PostgreSQL no futuro sem reescrever o CRM.

## 1. Obter a string de conexao

No projeto Supabase `leads`, obtenha a connection string PostgreSQL na area de conexao do projeto.

Nao salve essa string no GitHub.

## 2. Criar o arquivo local

Copie:

```bash
cp .env.example .env
```

Preencha no `.env`:

```env
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

O arquivo `.env` esta ignorado pelo Git.

## 3. Instalar dependencias

```bash
npm install
```

## 4. Aplicar migrations

```bash
npm run db:migrate
```

O executor registra cada migration em `schema_migrations` com checksum. Migration ja aplicada nao deve ser editada; crie uma nova migration.

## 5. Iniciar API e worker

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:worker
```

## 6. Health check

A API expoe:

```
GET /health
```

Ela verifica API, PostgreSQL e heartbeat do worker. WhatsApp, IA e Storage aparecem como `NOT_CONFIGURED` ate suas etapas especificas.

## Seguranca no Supabase

As tabelas da aplicacao possuem RLS habilitado e nao recebem policies de acesso direto ao frontend nesta fase.

A intencao e que o backend seja a unica porta de acesso aos dados do CRM. A autorizacao por organizacao tambem sera validada no backend.

## Migracao futura

Para mudar de fornecedor:

1. gerar backup PostgreSQL;
2. restaurar no novo PostgreSQL;
3. alterar apenas `DATABASE_URL`;
4. executar migrations pendentes;
5. validar `/health`.

Nenhuma regra de negocio deve depender de uma funcao exclusiva do Supabase.
