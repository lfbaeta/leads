# Leads

Projeto para um CRM simples, robusto e independente do banco de dados do Lovable.

## Objetivo

Centralizar leads, importar agendas/planilhas, organizar contatos e permitir automações de mensagens com processamento no servidor, inclusive quando a página estiver fechada.

## Diretrizes principais

- Frontend pode ser criado/gerenciado com Lovable.
- Banco de dados deve ficar fora do Lovable e sob controle do proprietário do projeto.
- Nenhuma chave secreta deve ficar no frontend ou no GitHub.
- Envios agendados devem rodar no backend/worker, não no navegador.
- Histórico e status dos leads devem ser persistidos no banco.
- Estrutura preparada para evolução por módulos.

## Módulos previstos

1. Dashboard
2. Leads
3. Importação de agenda/planilha
4. Fila de mensagens
5. Enviando
6. Enviados
7. Filtros e segmentação
8. Inteligência Artificial
9. Configurações
10. Auditoria e logs

## Status

Base inicial criada. A implementação funcional será feita em etapas para reduzir risco de erros.
