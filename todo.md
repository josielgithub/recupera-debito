# Recupera Débito - TODO

## Banco de Dados
- [x] Schema: tabela clientes (CPF único, nome)
- [x] Schema: tabela parceiros/escritórios (nome, whatsapp, email)
- [x] Schema: tabela processos (CNJ único, status_resumido, status_interno, advogado, monitoramento_ativo, ultima_atualizacao_api, raw_payload)
- [x] Schema: tabela logs_consulta (ip, cpf_hash, timestamp, resultado)
- [x] Schema: tabela rate_limit (ip, cpf, contador, janela)
- [x] Executar migração SQL

## Backend - API e Routers
- [x] Router: consulta pública por CPF (com rate limit e log)
- [x] Router: admin login (usuário/senha local, JWT)
- [x] Router: admin dashboard (cards por status, listas filtradas)
- [x] Router: importação de planilha Excel (validação + relatório)
- [x] Router: listagem e gestão de processos
- [x] Endpoint REST: POST /api/codilo/callback (receber atualizações)
- [x] Serviço Codilo: OAuth2 client_credentials, token cache
- [x] Serviço Codilo: cadastro de processo no Monitoramento PUSH
- [x] Normalização de status Codilo → 12 estados resumidos
- [x] Rotina: marcar processos sem atualização há 7 dias
- [x] Rate limit por IP e CPF (banco)
- [x] Logs de consulta pública

## Portal Público
- [x] Página inicial com campo de CPF e aviso de segurança
- [x] Validação de CPF (formato e dígito verificador)
- [x] Exibição de resultado: status resumido, última atualização, contato do escritório
- [x] Lista expansível de múltiplos processos (Processo 1, 2, 3... sem CNJ completo)
- [x] Detalhe de processo individual
- [x] Mensagens genéricas para CPF não encontrado
- [x] Design responsivo e limpo

## Dashboard Administrativo
- [x] Tela de login admin (via Manus OAuth)
- [x] Cards com quantidades por status (12 estados)
- [x] Lista: processos Ganho
- [x] Lista: processos Cumprimento de sentença
- [x] Lista: processos Perdido
- [x] Lista: processos sem atualização há 7 dias
- [x] Upload e importação de planilha Excel
- [x] Relatório de importação (linhas ok, erros, CPFs duplicados, CNJ inválido)
- [x] Visualização de logs de consulta

## Segurança
- [x] Aviso de segurança + rate limit no portal público (CAPTCHA externo pode ser integrado via VITE_CAPTCHA_SITE_KEY)
- [x] Rate limit: máx 10 consultas/minuto por IP, 20/hora por CPF
- [x] Logs de consulta com IP e CPF hasheados (SHA-256)
- [x] Mensagens genéricas (não expor se CPF existe ou não)
- [x] Validação de assinatura no callback Codilo (header X-Codilo-Secret)

## Configuração e Deploy
- [x] Variáveis de ambiente: CODILO_CLIENT_ID, CODILO_CLIENT_SECRET, CODILO_CALLBACK_URL
- [x] Autenticação admin via Manus OAuth (role=admin)
- [x] Variável: CODILO_CALLBACK_SECRET para validação de webhook
- [x] Documentação de configuração

## Funcionalidades Adicionais (fase 2)
- [x] Indicador visual de progresso dos 12 status no portal público
- [x] Página de processos filtrados por status no admin
- [x] Tabela de todos os processos com busca no admin
- [x] Gestão de parceiros/escritórios (CRUD) no admin
- [x] Geração e download de planilha modelo (.xlsx)
- [x] Endpoint para gerar planilha modelo de importação
- [x] Atualização manual de status de processo no admin
- [x] Página de documentação/configuração (variáveis de ambiente)
- [x] Indicador de status da integração Codilo no dashboard
- [x] Paginação na tabela de processos

## Filtro Avançado na Tabela de Processos
- [x] Backend: parâmetros de filtro por status e intervalo de datas no endpoint admin.processos
- [x] Frontend: painel de filtros com multi-select de status e date range picker
- [x] Frontend: badge de filtros ativos com opção de limpar individualmente
- [x] Frontend: contador de resultados filtrados
- [x] Testes: cobertura do novo endpoint com filtros (24 testes passando)

## Ordenação por Coluna na Tabela de Processos
- [x] Backend: parâmetros orderBy e orderDir no endpoint admin.processos
- [x] Frontend: cabeçalhos clicáveis com ícones de seta (asc/desc/neutro)
- [x] Frontend: estado de ordenação persistido junto com filtros
- [x] Testes: cobertura do novo parâmetro de ordenação (27 testes passando)

## Telefone e Histórico de Consultas
- [x] Schema: adicionar colunas telefone e cpf_mascarado na tabela logs_consulta
- [x] Migração SQL aplicada
- [x] Backend: salvar telefone e cpfMascarado em todos os logs
- [x] Backend: endpoint admin.historicoConsultas com paginação e filtros
- [x] Portal público: campo de telefone/celular com máscara e validação
- [x] Admin: aba "Histórico" com tabela paginada (CPF mascarado, telefone, IP, data, resultado)
- [x] Admin: exportar histórico em CSV (com filtros aplicados)
- [x] Testes: 27 testes passando (TypeScript sem erros)

## Gráfico de Consultas Diárias
- [x] Backend: endpoint admin.graficoConsultasDiarias (agregar por dia, últimos 30 dias)
- [x] Backend: retornar contagem por resultado (encontrado, nao_encontrado, bloqueado) por dia
- [x] Frontend: gráfico de linhas com Recharts acima da tabela na aba Histórico
- [x] Frontend: linhas coloridas por resultado com legenda (verde/cinza/vermelho)
- [x] Frontend: tooltip customizado com detalhes ao passar o mouse
- [x] Frontend: seletor de período (7, 15, 30 dias)

## Gráfico de Barras Empilhadas - Distribuição de Status
- [x] Backend: endpoint admin.graficoStatusProcessos (agregar por status e mês)
- [x] Frontend: gráfico de barras empilhadas com Recharts no Dashboard
- [x] Frontend: cores distintas para cada um dos 12 status
- [x] Frontend: tooltip com detalhes por status ao passar o mouse
- [x] Frontend: seletor de período (3, 6, 12 meses)
- [x] Frontend: legenda com labels dos 12 status (apenas ativos exibidos)

## Card de Resumo Mensal no Dashboard
- [x] Backend: endpoint admin.resumoMensal (total mês atual, mês anterior, variação %)
- [x] Frontend: card com total do mês atual e seta de variação (↑ verde / ↓ vermelho)
- [x] Frontend: mini-cards por categoria (ganhos, em andamento, sem atualização)
- [x] Frontend: posicionado acima do gráfico de barras empilhadas

## Integração Codilo - OAuth2 client_credentials
- [x] Credenciais CODILO_API_KEY e CODILO_API_SECRET configuradas via secrets
- [x] codilo.ts: função getCodiloToken() com cache e renovação automática
- [x] codilo.ts: função searchProcessByDocument(doc, tipo) — CPF/CNPJ/nome
- [x] codilo.ts: função updateProcessStatus() — atualiza processos no banco
- [x] codilo.ts: renovação automática de token em erro 401
- [x] codilo.ts: logs de erro sem interromper o sistema principal
- [x] routers.ts: endpoint admin.codiloTestarConexao
- [x] routers.ts: endpoint admin.codiloConsultarDocumento
- [x] routers.ts: endpoint admin.codiloAtualizarProcessos (disparo manual)
- [x] Rotina agendada: atualizar processos a cada 6 horas (servidor)
- [x] Admin: painel de integração Codilo com status, teste e atualização manual

## Correção Integração Codilo (Endpoints Corretos)

- [ ] codilo.ts: corrigir URL base para api.capturaweb.com.br e api.push.codilo.com.br
- [ ] codilo.ts: função searchProcessByCNJ(cnj) — GET /v1/autorequest?key=cnj&value={CNJ}
- [ ] codilo.ts: função listRequests() — GET /v1/request
- [ ] codilo.ts: função registerMonitoring(cnj) — POST /v1/processo/novo
- [ ] codilo.ts: retry automático em erro 401
- [ ] routers.ts: atualizar endpoints Codilo para usar as novas funções
- [ ] Testar endpoints reais via curl e confirmar resposta
- [ ] Painel admin Codilo: exibir resultado de listRequests e busca por CNJ

## Correção key API Codilo

- [x] codilo.ts: corrigir mapeamento de key — cpf/cnpj → "doc", nome → "nomeparte"
- [x] AdminCodilo.tsx: atualizar labels do select para refletir os tipos corretos

## Bug: Erro "undefined" na Consulta

- [x] Diagnosticar e corrigir erro "undefined" na consulta (aba Codilo) — handleConsultar usava consultar.data antes do re-render

## Bug: Busca por CPF retornava "0 processos"

- [x] Diagnosticar causa raiz: API Codilo /autorequest não suporta busca por CPF (só por CNJ)
- [x] Reformular endpoint codiloConsultarDocumento: busca por CPF no banco local, CNPJ/nome na API Codilo
- [x] Frontend: painel reformulado com aviso explicativo, opção de disparar atualização via Codilo, exibição de nome/CPF do cliente e detalhes completos dos processos
- [x] 27 testes passando, TypeScript sem erros

## Refatoração: Codilo → Judit

- [ ] Migrar schema do banco: remover codiloProcessoId, monitoramentoAtivo; renomear statusInterno→statusOriginal; adicionar juditProcessId, fonteAtualizacao; criar tabela judit_requests
- [ ] Remover server/codilo.ts e todas as referências Codilo no projeto
- [ ] Criar server/judit.ts com fluxo assíncrono, retry exponencial, mapeamento de status
- [ ] Criar endpoints tRPC para Judit (disparar, coletar, status)
- [ ] Substituir aba AdminCodilo por AdminJudit no painel admin
- [ ] Configurar cron job a cada 6h para atualização automática
- [ ] Adicionar JUDIT_API_KEY e JUDIT_BASE_URL como secrets

## Painel de Processos com Filtro por Status Judit

- [ ] Backend: endpoint admin.juditListarProcessos com filtros (statusRequisicao, statusResumido, paginação)
- [ ] Frontend: painel na aba Judit com tabela paginada de processos e filtros por status de atualização

## Payload Completo Judit + Detalhes no Admin

- [x] Corrigir script/judit.ts para salvar raw_payload completo (tribunal, vara, partes, assuntos, movimentações)
- [x] Reprocessar os 162 processos para salvar o payload completo
- [x] Criar endpoint admin.processoDetalhe que retorna raw_payload + dados do processo
- [x] Criar painel de detalhes do processo no AdminProcessos (modal com dados ricos da Judit)

## Bug: Status Incorreto (Arquivado → em_analise_inicial)

- [x] Corrigir mapearStatusJudit: combinação status=Finalizado + phase=Arquivado agora mapeada para arquivado_encerrado
- [x] Reprocessar processos com status incorreto via SQL (42 processos arquivados, 76 sem resposta da Judit ainda)

## Página de Detalhes do Processo (Payload Judit Completo)

- [ ] Endpoint tRPC admin.processoDetalhe retornando payload completo + judit_requests
- [ ] Página /admin/processo/:cnj com seções: dados gerais, partes, assuntos, movimentações, histórico de requisições
- [ ] Link "Ver detalhes" na tabela de processos apontando para a nova página
- [ ] Rota registrada no App.tsx dentro do layout admin

## Histórico Completo de Movimentações na Página de Detalhes

- [x] Exibir array steps[] completo da Judit na página /admin/processo/:cnj com timeline visual

## Cards de Status Clicáveis no Dashboard

- [x] Cards de distribuição por status no Dashboard tornam-se clicáveis e navegam para a tabela de processos filtrada pelo status selecionado
- [x] Tabela de processos recebe parâmetro de status via URL/query para pré-filtrar automaticamente
- [x] Indicador visual (highlight/seleção ativa) no card do status selecionado

## Nome e CPF do Cliente na Página de Detalhes do Processo

- [x] Endpoint admin.processoDetalhe retorna clienteNome e clienteCpf
- [x] Página ProcessoDetalhe exibe nome e CPF do cliente na seção "Dados no Sistema"

## Extração de Nome/CPF do Cliente a partir do Payload Judit

- [x] Identificar campos de nome e CPF do cliente no payload Judit (parties[])
- [x] Adaptar upsertProcesso para criar/vincular cliente automaticamente com dados da Judit
- [x] Retroativamente popular tabela clientes a partir dos raw_payload existentes nos processos

## Análise IA da Judit

- [x] Endpoint backend para criar requisição Judit com judit_ia:["summary"] e aguardar/buscar resultado
- [x] Salvar análise IA no banco de dados (campo ai_summary na tabela processos)
- [x] Botão "Gerar Análise IA" na página de detalhes do processo
- [x] Renderizar o resumo Markdown retornado pela Judit IA
- [x] Indicador de loading durante geração da análise

## Bug: Login Admin Redireciona para Área do Cliente

- [x] Diagnosticar fluxo OAuth: getLoginUrl() não preserva returnPath=/admin
- [x] Corrigir redirecionamento pós-login para /admin quando usuário clica em "Admin"

## Dev Auth Bypass

- [x] Acesso à área admin sem login no ambiente de desenvolvimento (NODE_ENV !== production)

## Bug: Timeout Análise IA

- [x] Refatorar Análise IA para polling assíncrono (backend retorna requestId, frontend faz polling)

## Salvar Processo Individual ao Buscar por CNJ

- [x] Backend: nova procedure admin.juditBuscarESalvarCnj — busca CNJ na Judit e salva/atualiza no banco mesmo que não exista ainda
- [x] Backend: criar cliente automaticamente a partir do payload (campo name) se não existir
- [x] Frontend: atualizar PainelConsultaCnj para usar a nova procedure e exibir feedback de "salvo no banco"
- [x] Testes: 22 testes passando, TypeScript sem erros

## Remoção de Rotina Automática

- [x] Remover cron/setInterval e funções iniciarRotinaCron/pararRotinaCron do judit.ts
- [x] Remover chamada iniciarRotinaCron e rotina setInterval do server/_core/index.ts

## Seleção em Massa e Alteração de Status em Lote

- [x] Backend: procedure admin.atualizarStatusEmLote(ids[], statusResumido)
- [x] Frontend: checkbox em cada linha da tabela de processos
- [x] Frontend: checkbox "selecionar todos" no cabeçalho da tabela
- [x] Frontend: barra de ações ao selecionar processos (contador + dropdown de status + botão aplicar)
- [x] Frontend: feedback visual (toast) com quantidade de processos atualizados
