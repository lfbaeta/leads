# Fase 04 — Leads e importação autenticados

Esta fase conecta as funções da Fase 02 à autenticação da Fase 03.

## Leads

Rotas protegidas por sessão:

- `GET /leads`: paginação e filtros por busca, status e cidade;
- `GET /leads/:id`: detalhes;
- `POST /leads`: cadastro manual;
- `PATCH /leads/:id`: edição;
- `DELETE /leads/:id`: arquivamento lógico.

Todas as consultas recebem `organizationId` exclusivamente da sessão autenticada. O cliente nunca escolhe a organização no body ou query.

O cadastro valida e normaliza o telefone no backend e bloqueia números presentes em `opt_outs`.

## Importação

Rotas protegidas:

- `GET /imports/template`;
- `POST /imports/preview`;
- `GET /imports/:id`;
- `POST /imports/:id/confirm`.

O preview:

1. recebe arquivo XLSX, XLS ou CSV em Base64;
2. aplica limites já definidos na Fase 02;
3. analisa e normaliza os registros;
4. cruza com leads existentes e opt-outs da organização;
5. persiste o preview;
6. retorna no máximo 200 linhas ao frontend, mantendo o conjunto completo no banco.

A confirmação usa as estratégias `IGNORE`, `UPDATE` ou `MERGE` e permanece transacional.

## Segurança

- organização vem da sessão;
- importações de outra organização não podem ser consultadas ou confirmadas;
- download do modelo exige autenticação;
- exclusão de lead é soft delete;
- criação e alterações geram auditoria;
- lista global de não contatar é validada no backend.

## Próxima etapa

A próxima fase deve implementar campanhas e fila persistente, mantendo a regra principal: apenas uma primeira abordagem automática por lead e depois aguardar resposta.
