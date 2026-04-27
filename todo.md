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

## Limpeza de Escritórios Parceiros Duplicados

- [x] Analisar padrão de duplicação na tabela parceiros
- [x] Remover 325 duplicados do parceiro "Recupera Debito", mantendo apenas o id 30198
- [x] Nenhum processo estava vinculado aos duplicados (parceiro_id > 30198 = 0 processos)
- [x] Tabela parceiros agora tem apenas 1 registro

## Correção: upsertParceiro sem duplicatas

- [x] upsertParceiro já usa onDuplicateKeyUpdate corretamente (INSERT ... ON DUPLICATE KEY UPDATE)
- [x] Constraint UNIQUE adicionada em nome_escritorio na tabela parceiros (migração aplicada)
- [x] A constraint garante que futuras importações não criem duplicatas (banco rejeita automaticamente)

## Análise IA Judit para Processos Inconclusivos

- [ ] Disparar judit_ia:summary para os 38 processos arquivados inconclusivos
- [ ] Aguardar processamento e coletar resultados
- [ ] Reclassificar status (concluido_ganho / concluido_perdido / acordo_negociacao) com base no resumo IA

## Resumo IA por Processo (LLM interno)

- [ ] Banco: adicionar coluna `resumo_ia` (TEXT) e `resumo_ia_gerado_em` (BIGINT) na tabela `processos`
- [ ] Backend: procedure `admin.gerarResumoIA(cnj)` — gera resumo via LLM com base nos dados do processo (partes, fase, movimentações, resultado)
- [ ] Backend: retornar `resumo_ia` e `resumo_ia_gerado_em` no endpoint `admin.processoDetalhe`
- [ ] Frontend: card "Resumo IA" na página de detalhes do processo com botão "Gerar Resumo"
- [ ] Frontend: exibir resumo com markdown renderizado e data de geração
- [ ] Frontend: botão "Regenerar" para atualizar o resumo existente

## Campo valor_obtido por Processo

- [x] Banco: coluna valor_obtido (decimal 15,2, nullable) adicionada na tabela processos
- [x] Backend: procedure admin.extrairValorObtidoIA — usa LLM para extrair valor das movimentações
- [x] Backend: procedure admin.atualizarValorObtido — atualização manual do valor
- [x] Frontend: card "Valor Obtido" na ficha do processo com botão "Extrair via IA" e campo editável
- [ ] Frontend: exibir valor_obtido no dashboard de resultados (pendente)

## Importação via Planilha com Conciliação Judit

- [ ] Backend: endpoint multipart para upload de planilha (.xlsx/.csv)
- [ ] Backend: parsing da planilha (colunas: CNJ, nome cliente, nome advogado, escritório)
- [ ] Backend: criar cliente, advogado e processo no banco para cada linha
- [ ] Backend: tabela import_jobs para rastrear o progresso da importação
- [ ] Backend: fila de conciliação Judit — buscar cada CNJ e atualizar dados do processo
- [ ] Frontend: página de importação com drag-and-drop de arquivo
- [ ] Frontend: preview das linhas antes de confirmar importação
- [ ] Frontend: barra de progresso em tempo real da conciliação Judit
- [ ] Frontend: relatório final com sucesso/erro por linha

## Importação via Planilha com Conciliação Judit

- [x] Banco: tabela import_jobs para rastrear progresso da conciliação Judit em tempo real
- [x] Backend: serviço importacaoSimples.ts com parsing das 4 colunas (cnj, nome_cliente, advogado, escritorio)
- [x] Backend: procedure admin.importarPlanilhaSimples — importa e dispara conciliação Judit em background
- [x] Backend: procedure admin.importJobStatus — polling do progresso em tempo real
- [x] Backend: procedure admin.listarImportJobs — histórico de importações
- [x] Backend: procedure admin.gerarPlanilhaModeloSimples — modelo com 4 colunas
- [x] Frontend: nova aba "Importar + Judit" no Admin com drag-and-drop, barra de progresso e relatório final
- [x] Frontend: histórico de importações anteriores com status e contadores

## Correções Integração Judit (31/03/2026 — suporte Judit)
- [x] Remover cache_ttl_in_days das requisições (não recomendado para dados em tempo real)
- [x] Corrigir obterResultadoJudit para iterar TODOS os objetos do array page_data (não apenas o primeiro)
- [x] Ignorar entradas lawsuit_not_found quando houver outra instância com dados válidos
- [x] Selecionar automaticamente a instância mais completa (score por steps + parties + status)
- [x] Implementar endpoint webhook POST /api/judit/webhook para receber notificações assíncronas
- [x] Remover cache local de 7 dias para requisições (substituído por deduplicação de 30min para processing)
- [ ] Configurar URL do webhook na plataforma Judit: https://recuperadeb-futgbwve.manus.space/api/judit/webhook
- [ ] Avaliar uso do serviço de monitoramento diário da Judit (em vez de polling manual)

## Seção de Documentos na Página de Detalhes

- [x] Exibir seção "Documentos" na página de detalhes do processo com lista de attachments da Judit
- [x] Filtrar e destacar documentos relevantes: sentença, alvará, decisão, mandado, acórdão
- [ ] Endpoint tRPC para baixar/visualizar documento via Judit (attachment_id)
- [ ] Botão para solicitar download do documento na Judit

## Refatoração Webhook Judit (modelo orientado a eventos)

- [x] Manter criarRequisicaoJudit() sem polling
- [x] Marcar verificarStatusRequisicao() e obterResultadoJudit() como fallback opcional
- [x] Implementar processamento completo no POST /api/judit/webhook
- [x] Reutilizar lógica de score, parsing de steps/parties e mapearStatusJudit()
- [x] Responder sempre HTTP 200 em < 2s (processar de forma assíncrona)
- [x] Adicionar log de origem e validação de request_id
- [x] Manter polling apenas como fallback para requests antigos

## Entidade Investidor
- [x] Criar tabela investidores no schema e migrar banco
- [x] Adicionar coluna investidorId (nullable FK) na tabela processos
- [x] Helpers de banco: upsertInvestidor, getInvestidores, vincularInvestidorAoProcesso
- [x] Procedures tRPC: listInvestidores, upsertInvestidor, vincularInvestidorEmLote, dashboardInvestidores
- [x] Filtro por investidor na procedure admin.processos
- [x] Atualizar importação simples e completa para aceitar coluna "investidor"
- [x] Seção "Processos por Investidor" no dashboard admin (aba Investidores)
- [x] Página de detalhes do investidor com lista de processos
- [x] Ação em lote "Vincular a investidor" na lista de processos
- [x] Exibir investidor na tela de detalhes do processo

## Filtro por Advogado nos Processos
- [x] Backend: adicionar campo `advogado` à interface FiltrosProcessos no db.ts
- [x] Backend: aplicar filtro LIKE por advogado na query listAllProcessos
- [x] Backend: adicionar `advogado` ao input da procedure admin.processos no routers.ts
- [x] Frontend: adicionar campo de texto "Advogado" no painel de filtros avançados do AdminProcessos

## Dashboard - Processos por Investidor
- [x] Adicionar seção "Processos por Investidor" no dashboard admin com cards por investidor
- [x] Exibir métricas por investidor: total de processos, ganhos, em andamento, perdidos
- [x] Link direto para lista de processos filtrada por investidor


## Tarefas Críticas - Fase Atual
- [x] Desativar dispararAtualizacaoBackground() em judit.ts
- [x] Remover botão "Rotina 7 dias" do frontend (removida procedure rodarRotina7dias e menção em AdminConfig.tsx)
- [x] Instalar @anthropic-ai/sdk (já estava instalado)
- [x] Implementar rota tRPC analisarProcessoIA com Claude (já implementada)
- [x] Atualizar ProcessoDetalhe.tsx para usar Claude (mutation atualizada)

## Sistema de Convites, Advogados e Investidores (Nova Fase)

### Schema e Banco
- [x] Adicionar enum roles ao users: advogado, investidor, advogado_investidor (campo extra_roles JSON)
- [x] Criar tabela convites (token, role, geradoPor, usadoEm, usadoPor, ativo, expiradoEm)
- [x] Criar tabela lotes (nome, descricao, advogadoId, percentualEmpresa, ativo)
- [x] Criar tabela lote_investidores (loteId, investidorId, percentual)
- [x] Adicionar colunas na tabela processos: advogadoId, loteId, statusJudit, aprovadoParaJuditEm, aprovadoParaJuditPor, clientePago, dataPagamentoCliente, valorPagoCliente, motivoDeclinado
- [x] Aplicar migrações SQL

### Backend - Convites
- [x] Rota admin.gerarConvite (role, expiradoEm)
- [x] Rota admin.listarConvites
- [x] Rota admin.revogarConvite (id)
- [x] Rota convite.verificar (token) — retorna role e status
- [x] Rota convite.vincularAoUsuario — vincula convite ao usuário logado

### Backend - Advogado
- [x] Rota advogado.meusDados
- [x] Rota advogado.meusProcessos
- [x] Rota advogado.cadastrarProcesso (cnj, cpfCliente) — NUNCA aciona Judit
- [x] Rota advogado.registrarResultado (processoId, valorObtido, clientePago, dataPagamento, valorPagoCliente)
- [x] Rota advogado.declinarProcesso (processoId, motivo)

### Backend - Investidor
- [x] Rota investidor.meusDados
- [x] Rota investidor.meusProcessos

### Backend - Admin (Lotes e Fila Judit)
- [x] Rota admin.criarLote
- [x] Rota admin.editarLote
- [x] Rota admin.listarLotes
- [x] Rota admin.listarUsuarios
- [x] Rota admin.desativarUsuario
- [x] Rota admin.filaJudit — lista processos com statusJudit = aguardando_aprovacao_judit
- [x] Rota admin.aprovarFilaJudit (processoIds[]) — dispara Judit e atualiza statusJudit

### Segurança
- [x] Verificar role === admin em TODAS as rotas que acessam Judit (FORBIDDEN em todas as rotas admin)

### Frontend - Convite
- [x] Página /convite/[token] com boas-vindas e botão OAuth
- [x] Após OAuth: vincular convite e redirecionar para dashboard correto

### Frontend - Advogado
- [x] Portal com header, cards de métricas, tabela de processos
- [x] Formulário cadastrar processo (modal)
- [x] Registrar resultado financeiro (modal)
- [x] Declinar processo

### Frontend - Investidor
- [x] Portal com header, cards de métricas financeiras, tabela de processos com percentuais
- [x] Projeção financeira por processo e total

### Frontend - Admin (novas funcionalidades)
- [x] Aba gestão de usuários: lista + gerar convite + revogar
- [x] Aba Fila Judit com seleção múltipla e confirmação
- [x] Aba Lotes com criação e gestão

## Correções AdminProcessos (Fase 5)

- [x] Corrigir query de investidores: buscar na tabela usuarios com role investidor/advogado_investidor
- [x] Backend: nova procedure admin.listarInvestidoresUsuarios
- [x] Backend: nova procedure admin.listarAdvogadosUsuarios
- [x] Implementar busca com debounce 400ms em tempo real (CNJ, nome, CPF)
- [x] Substituir filtro de advogado por Select dinâmico com lista de advogados cadastrados
- [x] Atualizar dropdown de vinculação de investidor para buscar na tabela usuarios
- [x] Implementar Dialog de percentual ao vincular investidor (validação 1-49%)
- [x] Trocar coluna Escritório por coluna Advogado na tabela de processos

## Edição de Usuários na Gestão Admin

- [ ] Schema: adicionar coluna `telefone` (varchar nullable) na tabela `users`
- [ ] Migração SQL aplicada
- [ ] Backend: função `updateUsuario(id, nome, telefone)` no db.ts
- [ ] Backend: procedure `admin.editarUsuario(usuarioId, nome, telefone)` com validação Zod
- [ ] Frontend: botão de lápis em cada linha da tabela de usuários (AdminUsuarios.tsx)
- [ ] Frontend: Dialog com campos Nome e Telefone (máscara (00) 00000-0000)
- [ ] Frontend: toast de sucesso "Dados atualizados com sucesso" via Sonner
- [ ] Frontend: invalidate da query após salvar (sem reload)

## Edição de Usuários na Gestão Admin

- [x] Adicionar coluna telefone (varchar nullable) na tabela users no schema Drizzle
- [x] Gerar migração Drizzle (0009_bitter_hulk.sql) e aplicar via SQL
- [x] Função db.updateUsuarioDados(id, nome, telefone) no server/db.ts
- [x] Procedure admin.editarUsuario com validação Zod (nome 2-100 chars, telefone 10-11 dígitos)
- [x] Verificação role === "admin" na procedure
- [x] Dialog de edição no AdminUsuarios.tsx com campo Nome, Telefone (máscara), Email somente leitura
- [x] Máscara de telefone (00) 00000-0000 aplicada no frontend
- [x] Toast de sucesso "Dados atualizados com sucesso" via Sonner
- [x] Fechar Dialog automaticamente após salvar
- [x] Invalidar cache React Query (utils.admin.listarUsuarios.invalidate())
- [x] Botão lápis (Pencil) em cada linha da tabela de usuários
- [x] Coluna Telefone adicionada na tabela de usuários
- [x] Não permite editar email (somente leitura) nem role

## Remoção de Escritórios e Perfil do Advogado

- [ ] Adicionar colunas oab, whatsapp, bio na tabela users (schema Drizzle)
- [ ] Gerar e aplicar migração SQL
- [ ] Atualizar procedure admin.editarUsuario com oab, whatsapp, bio (Zod + db)
- [ ] Atualizar Dialog de edição: mostrar campos oab/whatsapp/bio apenas para advogado/advogado_investidor
- [ ] Query portal do cliente: JOIN com users pelo advogadoId, retornar nome/whatsapp/oab do advogado
- [ ] Portal do cliente: substituir bloco "Escritório" por dados do advogado + botão WhatsApp
- [ ] Remover item "Escritórios" do menu de navegação admin
- [ ] Remover arquivo AdminParceiros.tsx (ou equivalente)
- [ ] Remover rota correspondente no App.tsx
- [ ] Remover rotas tRPC de escritórios não usadas
- [ ] Verificar referências a escritório em AdminProcessos.tsx, ProcessoDetalhe.tsx e Dashboard

## Unificação de Importação e Fila Judit

- [ ] Criar tabela judit_consulta_log no schema Drizzle e aplicar migração
- [ ] Criar rota tRPC admin.importarProcessos (sem Judit, com validação advogado_id)
- [ ] Criar rota tRPC admin.gerarModeloImportacao com duas abas (Processos + Advogados)
- [ ] Criar AdminImportar.tsx com upload drag-and-drop, modelo e histórico
- [ ] Adicionar seção de fila Judit com custo estimado na AdminJudit
- [ ] Atualizar menu: remover "Importar + Judit" e "Importação", adicionar "Importar"
- [ ] Remover AdminImportacaoSimples.tsx e arquivo antigo de importação
- [ ] Remover rotas tRPC antigas de importação não usadas

## Refatoração Painel Judit (Fase 7)

- [ ] Remover agendamentos automáticos do backend (judit.ts e _core/index.ts)
- [ ] Criar rotas tRPC: metricsJudit, filaJuditCompleta, buscarPorCpfJudit, historicoConsultas, exportarHistoricoCSV
- [ ] Reescrever AdminJudit.tsx com 4 seções: métricas, fila, busca CPF, histórico
- [ ] Atualizar ordem do menu: Dashboard, Processos, Importar, Histórico, Judit, Usuários, Investidores, Config
- [ ] Verificar TypeScript e testar fluxo completo

## Controle de Custo LLM Manus (Análise IA)

- [x] Reverter analisarProcessoIA para usar invokeLLM da Manus (remover integração @anthropic-ai/sdk)
- [x] Criar tabela manus_llm_log (id, processo_cnj, solicitadoPor, solicitadoEm, tokens_entrada, tokens_saida, custo_estimado, modelo, sucesso)
- [x] Aplicar migração Drizzle para manus_llm_log
- [x] Registrar log após cada clique em "Gerar Análise IA" (sucesso e falha)
- [x] Extrair tokens_entrada, tokens_saida e modelo da resposta da LLM Manus
- [x] Procedures tRPC: metricsAnalisesIA e listAnalisesIA (somente admin)
- [x] AdminJudit: 5º card "Análises IA geradas" com link para painel Manus
- [x] AdminJudit: aba toggle "Consultas Judit" / "Análises IA" na seção Histórico
- [x] Testes Vitest: inserção e consulta na tabela manus_llm_log (24 testes passando)

## Correções de Log e StatusJudit

- [x] Corrigir judit_consulta_log: registrar consultas em lote (tipo "consulta_lote") além das avulsas
- [x] Corrigir importação: gravar statusJudit = "aguardando_aprovacao_judit" ao salvar cada processo (já estava correto)
- [x] Verificar/criar coluna statusJudit na tabela processos via migration Drizzle (já existia)
- [x] Atualizar processos existentes em_analise_inicial sem statusJudit para "aguardando_aprovacao_judit" (não necessário: 0 NULL, DEFAULT correto)
- [x] Confirmar contagem final de processos por statusJudit: 238 aguardando, 11 consultado

## Refatoração AdminConfig (Remoção Codilo + Nova Tela)

- [x] Remover toda integração Codilo do backend (rotas, routers, index.ts, codilo.ts)
- [x] Remover referências Codilo do frontend (AdminConfig.tsx, App.tsx, outros)
- [x] Criar tabela configuracoes no Drizzle e aplicar migração
- [x] Criar procedures tRPC: getConfiguracoes, salvarConfiguracoes, promoverAdmin, removerAdmin
- [x] Criar nova tela AdminConfig.tsx com 4 seções (status integrações, config geral, segurança, admins)
- [x] Confirmar que /api/judit/callback continua funcionando após remoção da Codilo (Codilo nunca estava no index.ts)

## Modo "Visualizar como" (Impersonação)

- [ ] Criar tabela impersonacao_log no Drizzle e aplicar migração
- [ ] Funções db.ts: criarImpersonacao, buscarImpersonacaoPorToken, encerrarImpersonacao, listarImpersonacoes
- [ ] Procedure admin.iniciarImpersonacao (gera token UUID, salva no banco, retorna URL)
- [ ] Procedure auth.validarTokenImpersonacao (valida token, retorna usuário + isImpersonating)
- [ ] Procedure admin.encerrarImpersonacao (marca encerradoEm e ativo=false)
- [ ] Middleware de autenticação: detectar type="impersonation" no JWT, setar isImpersonating=true
- [ ] Middleware: bloquear mutations quando isImpersonating=true (TRPCError FORBIDDEN)
- [ ] Barra amarela fixa nos dashboards de advogado e investidor durante impersonação
- [ ] Botão "Voltar ao painel admin" na barra amarela (chama encerrarImpersonacao + redireciona)
- [ ] Botão "Visualizar como" na tabela AdminUsuarios.tsx (apenas para adv/investidor/adv_investidor)
- [ ] Testes Vitest: fluxo completo de impersonação

## Sistema de Problemas Judit

- [x] Criar tabela judit_problemas no Drizzle (id, processoCnj, requestId, tipo, descricao, enviadoEm, detectadoEm, tentativas, resolvido, resolvidoEm, observacao)
- [x] Aplicar migração Drizzle para judit_problemas (migration 0016)
- [x] Registrar 3 CNJs travados como problemas iniciais
- [x] Funções db.ts: detectarERegistrarTimeouts, listarProblemasJudit, marcarProblemaResolvido, atualizarObservacaoProblema, incrementarTentativasProblema, countProblemasJudit, resetStatusJuditParaFila
- [x] Procedures tRPC juditProblemas: detectarTimeouts, listar, contagem, marcarResolvido, atualizarObservacao, tentarNovamente
- [x] AdminJudit: 4ª aba "Problemas" com badge de contagem de não resolvidos
- [x] AdminJudit: seção SecaoProblemas com tabela, filtro toggle, exportação CSV, verificação automática ao abrir
- [x] AdminJudit: botões por linha — "Resolver", "Tentar novamente", "Editar observação"
- [x] Verificação automática de timeouts via useEffect ao abrir a aba Problemas
- [x] TypeScript sem erros, 24 testes passando

## Correção do Modo de Impersonação (ctx.user substituído corretamente)

- [x] client/src/lib/trpc.ts: injetar header x-impersonacao-token nas requisições quando token estiver no sessionStorage
- [x] server/_core/context.ts: validar header x-impersonacao-token, substituir ctx.user pelo usuário visualizado, adicionar isImpersonating e adminId ao contexto
- [x] server/routers.ts: middleware impersonatedProcedure que bloqueia mutations quando isImpersonating=true (exceto auth.validarTokenImpersonacao e admin.encerrarImpersonacao)
- [x] client/src/pages/AdvogadoPortal.tsx: desabilitar botão "Cadastrar Processo" com tooltip quando em modo de visualização
- [x] Testes Vitest: validação do token de impersonação e bloqueio de mutations

## Sistema de Lotes Completo

- [x] Schema Drizzle: tabelas lotes, lote_investidores, lote_importacao_erros
- [x] Schema Drizzle: coluna loteId na tabela processos
- [x] Migration SQL aplicada via webdev_execute_sql
- [x] Helpers DB: listarLotes, criarLote, editarLote, importarProcessosLote, listarProcessosLote, desvincularProcessoLote, listarErrosLote, resolverErroLote
- [x] Rotas tRPC: admin.listarLotes, admin.criarLote, admin.editarLote, admin.importarProcessosLote, admin.listarProcessosLote, admin.desvincularProcessoLote, admin.listarErrosLote, admin.resolverErroLote
- [x] Tela AdminLotes.tsx: lista de lotes, modal novo lote, importação de CNJs, detalhes do lote
- [x] Seção "Processos vinculados" no detalhe do lote com projeção por participante
- [x] Seção "Erros de importação" no detalhe do lote
- [x] Item "Lotes" já presente como aba na tela Admin.tsx
- [x] Testes Vitest: 13 testes cobrindo controle de acesso e validação de input das procedures de lotes

## Correções Anti-Duplicata Judit (7 correções)

- [ ] C2: procedure aprovarFilaJudit — verificar statusJudit === "aguardando_aprovacao_judit" antes de consultar, pular CNJs já consultados
- [ ] C3: criarRequisicaoJudit — cooldown 24h verificando judit_consulta_log, reutilizar resultado existente
- [ ] C5: idempotência tRPC — tabela operacoes_idempotentes (requestKey UUID, resultado JSON, TTL 1h), procedure aprovarFilaJudit verifica requestKey duplicado
- [ ] C7: migration — campo is_duplicata (boolean) na tabela judit_consulta_log, marcar 109 registros existentes, ajustar query de crédito restante
- [ ] C1: AdminJudit frontend — isProcessing flag, botão desabilitado durante loading, debounce 2s no confirmar
- [ ] C4: AdminJudit frontend — aviso amarelo no Dialog com contagem de CNJs já consultados e custo estimado ajustado
- [ ] C6: AdminJudit histórico — badge "Duplicata" laranja na coluna, card de resumo "Consultas duplicadas este mês: X — Custo desperdiçado: R$ Y"
- [ ] Testes Vitest cobrindo as novas validações

## Correção Definitiva Erro HTML em Lote Judit
- [x] Investigar logs do servidor no momento do erro
- [x] Verificar middleware global de erro no Express
- [x] Verificar processamento em lote (concorrência ilimitada)
- [x] Correção 1: Handler global de erro JSON no Express
- [x] Correção 2: Processamento em lote com concorrência limitada (5 por vez, 500ms)
- [x] Correção 3: Tratamento de rate limit 429 com retry
- [x] Correção 4: Logs detalhados de cada etapa do processamento em lote
- [x] Verificar e marcar duplicatas geradas no episódio (41 novos registros marcados)


## Remoção de Consulta Automática à Judit (Passo 1-5)
- [x] Passo 1: Modificar admin.processoMovimentacoes para leitura simples (sem chamar Judit)
- [x] Passo 4: Limpar buscarMovimentacoesJudit para retornar apenas do cache
- [x] Passo 5: Adicionar getConsultaRecenteJudit no db.ts
- [x] Passo 3: Criar rota admin.atualizarProcessoJudit com cooldown 24h
- [x] Passo 2: Adicionar botão "Atualizar na Judit" no ProcessoDetalhe.tsx


## Correção Crítica: Formato do request_id (UUID vs Numérico)
- [ ] Investigar: verificar código, banco de dados e resposta real da Judit
- [ ] Corrigir código para sempre usar UUID da Judit e adicionar validação Zod
- [ ] Marcar registros inválidos no banco e mover processos afetados de volta para fila
- [ ] Verificar TypeScript, testes e salvar checkpoint

## Correção de Duplicatas de request_id (Race Condition)
- [x] Investigar padrão de duplicatas: 4 registros com mesmo request_id para o mesmo CNJ
- [x] Identificar causa: race condition onde múltiplos cliques acontecem antes de isPending ficar true
- [x] Correção 1 (Frontend): adicionar useTransition do React 19 para desabilitar botão IMEDIATAMENTE
- [x] Correção 2 (Backend): tornar requestKey OBRIGATÓRIO no schema Zod (não mais opcional)
- [x] Correção 3 (Backend): adicionar validação de UUID para request_id com função isValidUUID
- [x] Correção 4 (AdminFilaJudit.tsx): adicionar requestKey e handleAbrirDialog para gerar novo UUID a cada abertura
- [x] Correção 5 (AdminJudit.tsx): adicionar useTransition e desabilitar botão durante transição
- [x] Testes Vitest: 6 novos testes cobrindo validação de UUID, idempotência, e rejeição de requestKey inválido (50 testes passando)


## Passo 1: Marcar Duplicatas e Inválidos Existentes
- [x] Adicionar coluna `is_duplicata` ao schema Drizzle (já existia)
- [x] Adicionar coluna `request_id_invalido` ao schema Drizzle
- [x] Gerar migration SQL com drizzle-kit generate
- [x] Aplicar migration ao banco de dados
- [x] Marcar 90 registros com request_id NULL como `request_id_invalido = true`
- [x] Marcar 186 registros duplicados (mesmo CNJ no mesmo dia) como `is_duplicata = true`
- [x] Resultado final: 355 registros válidos, 186 duplicados, 90 com UUID inválido (total: 631)

## Passo 2: Mover Processos Afetados de Volta para Fila
- [x] Identificar 66 processos com statusJudit = "consultado" mas com registros problemáticos
- [x] Mover 66 processos de volta para statusJudit = "aguardando_aprovacao_judit"
- [x] Processos agora voltarão à fila para nova consulta com request_id válido

## Passo 3: Aba "Qualidade de Dados" no AdminJudit
- [x] Criar arquivo `judit-qualidade.ts` com 3 functions:
  - [x] `metricsQualidadeJudit()`: retorna métricas de qualidade (válidas, duplicatas, requestIdInvalidos, taxaSucesso)
  - [x] `listRegistrosProblemáticos()`: lista registros com is_duplicata=true ou request_id_invalido=true
  - [x] `creditoRestanteEsteMs()`: calcula crédito restante considerando apenas registros válidos
- [x] Adicionar procedures tRPC em admin.juditQualidade:
  - [x] `metricas`: retorna métricas de qualidade
  - [x] `registrosProblemáticos`: lista registros problemáticos com paginação
  - [x] `creditoRestante`: retorna crédito restante e custo com duplicatas
- [x] Criar componente `SecaoQualidade` em AdminJudit-Qualidade.tsx com:
  - [x] 4 cards de métricas (Consultas Válidas, Duplicadas, UUID Inválido, Taxa de Sucesso)
  - [x] Card de Crédito Restante com custo de duplicatas/inválidos separado
  - [x] Tabela de registros problemáticos com paginação
  - [x] Botão "Exportar CSV" (placeholder)
- [x] Adicionar aba "Qualidade" ao AdminJudit.tsx com 5 abas no total
- [x] Ajustar cálculo de crédito restante para considerar apenas registros válidos
- [x] Todos os 50 testes Vitest passando

## Resumo Final
- ✅ Correção de race condition com useTransition e requestKey obrigatório
- ✅ Validação de UUID para request_id
- ✅ 631 registros analisados: 355 válidos, 186 duplicados, 90 com UUID inválido
- ✅ 66 processos movidos de volta para fila
- ✅ Aba "Qualidade de Dados" criada com métricas e registros problemáticos
- ✅ Crédito restante ajustado para contar apenas registros válidos
- ✅ 50 testes Vitest passando (0 erros TypeScript)


## Rastreamento de Error ID da Judit
- [ ] Adicionar coluna `error_id` (UUID) à tabela judit_problemas
- [ ] Investigar resposta de erro da Judit para extrair error_id
- [ ] Atualizar buscarESalvarProcessoJudit para capturar error_id
- [ ] Atualizar aba Qualidade para mostrar error_id nos registros problemáticos
- [ ] Testes para validar captura de error_id


## Adição de Request ID em Exportações CSV e Tabelas
- [x] Adicionar coluna `request_id` na exportação CSV do histórico Judit
- [x] Adicionar coluna `request_id` na exportação CSV de problemas registrados
- [x] Adicionar coluna `request_id` na exportação CSV da aba Qualidade de Dados
- [x] Adicionar coluna `request_id` na tabela visual do histórico (truncado com tooltip)
- [x] Adicionar coluna `request_id` na tabela de problemas registrados (truncado com tooltip)
- [x] Implementar função `exportarCsv` na aba Qualidade de Dados
- [x] Formato CSV com UUID completo (sem truncar) para rastreamento junto ao suporte Judit
- [x] Tabelas visuais com UUID truncado (primeiros 8 caracteres + "...") e tooltip ao passar mouse


## Problema 1: Aba "Problemas" Não Mostra Registros
- [x] Investigar query da rota juditProblemas.listar
- [x] Verificar se há filtro que exclui todos os registros
- [x] Abrir console do navegador e capturar erro exato
- [x] Corrigir e confirmar que 64 registros aparecem (migration error_id aplicada)

## Problema 2: Análise de Taxa de Sucesso (56%)
- [x] Distribuição de status das 631 consultas (sucesso, nao_encontrado, erro)
- [x] Distribuição de status dos 355 registros válidos
- [x] Top 10 tribunais com maior taxa de nao_encontrado

## Request ID na Aba Judit > Problemas
- [x] Adicionar coluna request_id na tabela visual da aba Problemas
- [x] Adicionar campo request_id na exportação CSV da aba Problemas

## Novo Fluxo de Cadastro Direto pelo Admin
- [x] Migration: adicionar coluna `statusCadastro` (enum: aguardando_acesso, ativo, inativo) na tabela users
- [x] Backend: procedure admin.criarUsuario (nome, roleConvite) — cria usuário e gera convite automaticamente
- [x] Backend: procedure admin.gerarLinkAcesso (usuarioId) — gera ou regenera token de acesso
- [x] Backend: atualizar fluxo OAuth para vincular usuário pré-cadastrado (usar nome e role já definidos)
- [x] Frontend: botão "+ Novo Usuário" no AdminUsuarios com Dialog (nome, role, salvar)
- [x] Frontend: botão "Gerar Link" para usuários com status "Aguardando acesso"
- [x] Frontend: mostrar status "Aguardando acesso" / "Ativo" na tabela de usuários
- [x] Manter fluxo atual de convite funcionando

## Correção do Comportamento de Importação (advogado_id em processos existentes)
- [x] Identificar que importação não atualizava advogado_id em processos já existentes
- [x] Corrigir procedure importarProcessos: quando advogado selecionado, atualizar advogado_id mesmo em processos existentes
- [x] Reatribuir manualmente 84 processos do Marcos para Rogério Teópilo
- [x] 50 testes Vitest passando após correção

## Detecção Automática de Alvará
- [x] Adicionar ALVARA_REGEX e função detectarAlvara em server/judit.ts
- [x] Detecção em last_step.content, steps[], attachments[], response_data.steps[]
- [x] mapearStatusJudit retorna concluido_ganho com prioridade máxima quando alvará detectado
- [x] Log [Judit] Alvará detectado para CNJ ... com origem da detecção
- [x] Reprocessar 422 processos existentes: 55 atualizados para concluido_ganho
- [x] 50 testes Vitest passando

## Classificação Automática de Processos Arquivados
- [x] Regra 2: arquivado + related_lawsuits → em_recurso (mapearStatusJudit)
- [x] Regra 3: arquivado + palavras-chave no last_step → concluido_perdido (mapearStatusJudit)
- [x] Regra 4: arquivado sem related_lawsuits e sem palavras-chave → manter arquivado_encerrado (revisão manual)
- [x] Reclassificação retroativa: 15 → em_recurso, 143 → concluido_perdido, 61 → revisão manual
- [x] Botão "Revisão manual" na tela AdminProcessos com filtro rápido
- [x] Botões ThumbsUp/ThumbsDown por linha para processos arquivado_encerrado
- [x] 50 testes Vitest passando

## Melhorias na Classificação Automática (3 melhorias)
- [x] Melhoria 1: "trânsito em julgado + baixa" → concluido_perdido (PERDIDO_REGEX atualizado)
- [x] Melhoria 2: em_recurso pelo last_step (RECURSO_LAST_STEP_REGEX adicionado como REGRA 2b)
- [x] Reclassificação retroativa dos 61 processos: 1 → em_recurso, 1 → concluido_perdido, 59 → revisão manual
- [x] Melhoria 3: system prompt da LLM atualizado com bloco INTERPRETAÇÃO DE STATUS
- [x] 50 testes Vitest passando

## Download de Autos Processuais
- [x] Migration: colunas autosDisponiveis, autosDisponivelEm, autosSolicitadoEm na tabela processos
- [x] Migration: tabela processo_autos (id, processoId, attachmentId, nomeArquivo, urlS3, fileKey, etc.)
- [x] Backend: criarRequisicaoJudit com suporte a withAttachments=true
- [x] Backend: rota tRPC admin.baixarAutosProcessos (seleção em lote, custo R$3,50/processo)
- [x] Backend: rota tRPC admin.getAutosProcesso (listar autos de um processo)
- [x] Backend: webhook processarResultadoJudit atualizado para salvar attachments no S3
- [x] Frontend: botão "Baixar autos" na barra de ação em lote do AdminProcessos
- [x] Frontend: dialog de confirmação com custo estimado antes do download
- [x] Frontend: ícone de clipe (Paperclip) na coluna CNJ para processos com autos disponíveis
- [x] Frontend: componente AutosProcessuaisCard no ProcessoDetalhe com lista de documentos e links de download

## Melhorias Portal do Cliente + Aba Autos no AdminJudit
- [x] Portal do cliente: barra de progresso animada com Framer Motion (motion.div com initial/animate)
- [x] Portal do cliente: textos descritivos por status (mensagem personalizada para cada um dos 12 status)
- [x] Portal do cliente: índice de documentos por processo (lista de documentos quando autosDisponiveis=true)
- [x] AdminJudit: nova aba "Autos" com 4 cards de métricas (solicitados, disponíveis, total docs, custo)
- [x] AdminJudit: aviso sobre endpoint de download da Judit retornando 502
- [x] AdminJudit: tabela de processos com autos solicitados (CNJ, cliente, advogado, data, docs, status)
- [x] Backend: rota admin.listarProcessosComAutos com join em clientes e users
- [x] 50 testes Vitest passando

## Correção: Abrir ProcessoDetalhe em nova aba
- [x] AdminProcessos.tsx: botão ExternalLink (irParaDetalhe) usa window.open(..., '_blank') em vez de setLocation
- [x] AdminJudit.tsx (aba Autos): link do CNJ recebe target="_blank" rel="noopener noreferrer" e URL corrigida para /admin/processo/:cnj
- [x] Ícone Eye (visualização rápida) mantido sem alteração
- [x] TypeScript sem erros

## Correções e Melhorias AutosProcessuaisCard (2026-04-27)
- [x] Corrigir isDone: habilitar botão para status pending/done/null, desabilitar só para error/corrupted
- [x] Botão "Baixar todos" com progresso sequencial e toast de conclusão
- [x] Badge de instância por documento (1ª=azul, 2ª=roxo, 3ª=verde)

## Unificação Seções Documentos + Autos Processuais (2026-04-27)
- [x] Criar componente DocumentosCard unificado com 4 casos (Disponível/Não baixado/Solicitar/Indisponível)
- [x] Cruzar payload Judit com tabela processo_autos por attachment_name
- [x] Botão Baixar todos para Caso 2 (não baixados)
- [x] Remover seções antigas "Documentos" e "Autos Processuais" separadas

## Melhorias Cruzamento Documentos (2026-04-27)
- [x] Melhoria 1: retornar attachmentId na rota getAutosProcesso e usar como critério primário no DocumentosCard
- [x] Melhoria 2: normalizar nomeArquivo para uppercase no webhook e no cruzamento
- [x] Melhoria 3: attachment_id já preenchido em todos os 780 registros (0 vazios) — sem atualização necessária

## Correção Webhook Judit e Reprocessamento (2026-04-27)
- [ ] Passo 1: publicar checkpoint atualizado no site recuperadeb-futgbwve.manus.space
- [ ] Passo 1: publicar checkpoint atualizado no site recuperadeb-futgbwve.manus.space
- [x] Passo 2: criar rota admin.reprocessarAutosJudit e reprocessar 7 processos pendentes
- [x] Passo 3: card de monitoramento de webhook no AdminJudit (último webhook, status do deploy)
- [ ] Passo 4: testar fluxo completo com 1 processo novo após publicação

## Fluxo de Download de Autos (Individual + Lote Pendentes)

- [x] Criar rota tRPC admin.iniciarDownloadAutos (cria requisição Judit with_attachments=true, retorna request_id)
- [x] Criar rota tRPC admin.verificarResultadoAutos (GET /responses, processa attachments com id.length>6 e status=done, salva S3+DB)
- [x] Fluxo 1: botão "Baixar autos" no ProcessoDetalhe com polling 30s/20 tentativas
- [x] Fluxo 2: botão "Processar pendentes" no AdminJudit para processos com autos_solicitado_em e autosDisponiveis=false
- [x] Registrar custo R$3,50 no judit_consulta_log ao iniciar download individual
