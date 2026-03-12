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
