# Fase 02 — Importação de agenda/planilha

## Arquivo modelo analisado

A planilha real utilizada como referência possui uma aba chamada `Empresas` e as seguintes colunas, nesta ordem:

1. Nome
2. Endereço
3. Telefone
4. E-mail
5. Rating
6. Avaliações
7. Website
8. WhatsApp
9. Status
10. Categoria
11. Tipos
12. Data_Exportacao
13. Hora_Exportacao

O sistema não depende apenas desses nomes. O mapeamento é configurável e poderá ser alterado pela interface futuramente.

## Resultado da análise do arquivo de referência

Sem armazenar o arquivo real no repositório:

- 70 linhas de dados;
- 57 linhas com telefone brasileiro normalizável;
- 6 ocorrências duplicadas pelo mesmo telefone dentro da própria planilha;
- 13 linhas sem telefone utilizável;
- 51 contatos únicos com telefone válido antes da comparação com o banco.

Esses números servem apenas como validação da regra do importador.

## Mapeamento padrão

| Planilha | CRM |
| --- | --- |
| Nome | name + company |
| Telefone | phone_original + phone_normalized |
| Endereço | address |
| E-mail | email |
| Website | website |

Quando não existir coluna de cidade, o importador tenta extrair o município do endereço brasileiro.

As demais colunas são preservadas em `custom_fields` e também em `import_rows.raw_data`.

## Formatos suportados

- `.xlsx`
- `.xls`
- `.csv`

Limites iniciais:

- arquivo: 15 MB;
- linhas: 50.000.

O parser não executa fórmulas nem macros.

## Fluxo

### 1. Leitura

`parseSpreadsheetBuffer()` lê a primeira aba útil, preserva o cabeçalho e normaliza valores para formato serializável.

### 2. Análise

`analyzeSpreadsheetImport()`:

- mapeia colunas;
- limpa placeholders como "Não informado";
- normaliza telefone;
- identifica linha inválida;
- identifica duplicidade dentro do arquivo;
- extrai cidade quando possível;
- preserva campos extras.

### 3. Comparação com PostgreSQL

`enrichImportAnalysisFromDatabase()` consulta:

- leads já cadastrados;
- flag de opt-out do lead;
- lista global `opt_outs`.

O preview passa a separar:

- VALID;
- DUPLICATE;
- INVALID;
- EXISTING;
- OPT_OUT.

### 4. Persistência do preview

`persistImportPreview()` cria `import_jobs` e `import_rows`.

Nenhum lead é criado nesta etapa.

### 5. Confirmação

`confirmImportJob()` só executa depois da confirmação explícita.

Para contatos existentes, suporta:

- `IGNORE`;
- `UPDATE`;
- `MERGE`.

Contatos em opt-out não são importados como novos contatos.

## Modelo para download

A API possui:

`GET /imports/template`

Ela gera dinamicamente `modelo-importacao-empresas.xlsx` com as 13 colunas do arquivo real.

## Campos flexíveis

A migration 003 adiciona ao lead:

- address;
- email;
- website;
- custom_fields.

A migration 004 adiciona persistência do preview:

- `import_jobs.opt_out_rows`;
- `import_rows.mapped_data`.

## O que ainda não foi exposto por HTTP

O endpoint de upload/preview/confirmar não será publicado sem autenticação e autorização.

Isso é intencional: importação altera dados do CRM e precisa conhecer o usuário e a organização autenticados.

A próxima integração deverá expor aproximadamente:

- `POST /imports/preview`;
- `POST /imports/:id/confirm`;
- `GET /imports/:id`;
- `GET /imports`.

Essas rotas deverão usar o contexto autenticado; nunca receber `organization_id` confiando diretamente no frontend.
