import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Usuários (auth Manus OAuth) ───────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  foto: varchar("foto", { length: 512 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Roles adicionais para advogados e investidores (além do role principal)
  extraRoles: json("extra_roles").$type<string[]>(),
  conviteId: int("convite_id"),
  ativo: boolean("ativo").default(true).notNull(),
  telefone: varchar("telefone", { length: 20 }),              // telefone/WhatsApp do usuário
  oab: varchar("oab", { length: 30 }),                        // número OAB do advogado (ex: OAB/MT 12345)
  whatsappSuporte: varchar("whatsapp_suporte", { length: 20 }), // WhatsApp de suporte do advogado
  bio: text("bio"),                                          // bio/apresentação do advogado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Convites ────────────────────────────────────────────────────────────────
export const convites = mysqlTable("convites", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  roleConvite: mysqlEnum("role_convite", ["advogado", "investidor", "advogado_investidor"]).notNull(),
  geradoPor: int("gerado_por").notNull(), // FK users.id (admin)
  geradoEm: timestamp("gerado_em").defaultNow().notNull(),
  usadoEm: timestamp("usado_em"),
  usadoPor: int("usado_por"), // FK users.id
  ativo: boolean("ativo").default(true).notNull(),
  expiradoEm: timestamp("expirado_em"), // nullable — sem expiração se null
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Convite = typeof convites.$inferSelect;
export type InsertConvite = typeof convites.$inferInsert;

// ─── Investidores ────────────────────────────────────────────────────────────
export const investidores = mysqlTable("investidores", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull().unique(),
  percentualParticipacao: decimal("percentual_participacao", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Investidor = typeof investidores.$inferSelect;
export type InsertInvestidor = typeof investidores.$inferInsert;

// ─── Lotes (agrupamento de processos para investidores) ─────────────────────
export const lotes = mysqlTable("lotes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  advogadoId: int("advogado_id"), // FK users.id (usuário com role advogado)
  percentualEmpresa: decimal("percentual_empresa", { precision: 5, scale: 2 }).default("0").notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Lote = typeof lotes.$inferSelect;
export type InsertLote = typeof lotes.$inferInsert;

// ─── Lote Investidores (relação N:N lotes ↔ investidores com percentual) ────
export const loteInvestidores = mysqlTable("lote_investidores", {
  id: int("id").autoincrement().primaryKey(),
  loteId: int("lote_id").notNull(),
  investidorId: int("investidor_id").notNull(), // FK users.id (usuário com role investidor)
  percentual: decimal("percentual", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LoteInvestidor = typeof loteInvestidores.$inferSelect;
export type InsertLoteInvestidor = typeof loteInvestidores.$inferInsert;

// ─── Parceiros / Escritórios ───────────────────────────────────────────────
export const parceiros = mysqlTable("parceiros", {
  id: int("id").autoincrement().primaryKey(),
  nomeEscritorio: varchar("nome_escritorio", { length: 255 }).notNull().unique(),
  whatsapp: varchar("whatsapp", { length: 30 }),
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Parceiro = typeof parceiros.$inferSelect;
export type InsertParceiro = typeof parceiros.$inferInsert;

// ─── Clientes ─────────────────────────────────────────────────────────────
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  cpf: varchar("cpf", { length: 14 }).unique(), // formato: 000.000.000-00 (opcional: pode ser null quando vem da Judit)
  nome: varchar("nome", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Status Resumido (12 estados) ─────────────────────────────────────────
export const STATUS_RESUMIDO = [
  "em_analise_inicial",
  "protocolado",
  "em_andamento",
  "aguardando_audiencia",
  "aguardando_sentenca",
  "em_recurso",
  "cumprimento_de_sentenca",
  "concluido_ganho",
  "concluido_perdido",
  "aguardando_documentos",
  "acordo_negociacao",
  "arquivado_encerrado",
] as const;

export type StatusResumido = (typeof STATUS_RESUMIDO)[number];

export const STATUS_RESUMIDO_LABELS: Record<StatusResumido, string> = {
  em_analise_inicial: "Em análise inicial",
  protocolado: "Protocolado",
  em_andamento: "Em andamento",
  aguardando_audiencia: "Aguardando audiência",
  aguardando_sentenca: "Aguardando sentença",
  em_recurso: "Em recurso",
  cumprimento_de_sentenca: "Cumprimento de sentença",
  concluido_ganho: "Concluído – ganho",
  concluido_perdido: "Concluído – perdido",
  aguardando_documentos: "Aguardando documentos",
  acordo_negociacao: "Acordo/negociação",
  arquivado_encerrado: "Arquivado/encerrado",
};

// ─── Status Judit (fila de aprovação) ─────────────────────────────────────
export const STATUS_JUDIT = [
  "aguardando_aprovacao_judit",
  "consultado",
  "nao_encontrado",
] as const;

export type StatusJudit = (typeof STATUS_JUDIT)[number];

// ─── Processos ─────────────────────────────────────────────────────────────
export const processos = mysqlTable("processos", {
  id: int("id").autoincrement().primaryKey(),
  cnj: varchar("cnj", { length: 30 }).notNull().unique(), // formato CNJ: 0000000-00.0000.0.00.0000
  clienteId: int("cliente_id").notNull(),
  parceiroId: int("parceiro_id"),
  advogado: varchar("advogado", { length: 255 }),
  advogadoId: int("advogado_id"), // FK users.id (usuário com role advogado)
  loteId: int("lote_id"), // FK lotes.id
  statusResumido: mysqlEnum("status_resumido", STATUS_RESUMIDO).default("em_analise_inicial").notNull(),
  statusOriginal: varchar("status_original", { length: 255 }),
  // Fila de aprovação Judit
  statusJudit: mysqlEnum("status_judit", STATUS_JUDIT).default("aguardando_aprovacao_judit").notNull(),
  aprovadoParaJuditEm: timestamp("aprovado_para_judit_em"),
  aprovadoParaJuditPor: int("aprovado_para_judit_por"), // FK users.id (admin)
  motivoDeclinado: text("motivo_declinado"),
  // Integração Judit
  juditProcessId: varchar("judit_process_id", { length: 128 }),
  fonteAtualizacao: mysqlEnum("fonte_atualizacao", ["judit"]).default("judit").notNull(),
  ultimaAtualizacaoApi: timestamp("ultima_atualizacao_api"),
  rawPayload: json("raw_payload"),
  aiSummary: text("ai_summary"),
  aiSummaryUpdatedAt: timestamp("ai_summary_updated_at"),
  // Resultado financeiro
  valorObtido: decimal("valor_obtido", { precision: 15, scale: 2 }),
  valorObtidoUpdatedAt: timestamp("valor_obtido_updated_at"),
  clientePago: boolean("cliente_pago").default(false),
  dataPagamentoCliente: timestamp("data_pagamento_cliente"),
  valorPagoCliente: decimal("valor_pago_cliente", { precision: 15, scale: 2 }),
  // Controle
  semAtualizacao7dias: boolean("sem_atualizacao_7dias").default(false).notNull(),
  investidorId: int("investidor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type Processo = typeof processos.$inferSelect;
export type InsertProcesso = typeof processos.$inferInsert;

// ─── Logs de Consulta Pública ──────────────────────────────────────────────
export const logsConsulta = mysqlTable("logs_consulta", {
  id: int("id").autoincrement().primaryKey(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),       // SHA-256 do IP
  cpfHash: varchar("cpf_hash", { length: 64 }).notNull(),     // SHA-256 do CPF
  cpfMascarado: varchar("cpf_mascarado", { length: 14 }),     // ex: ***.982.247-**
  telefone: varchar("telefone", { length: 20 }),              // número informado pelo consulente
  resultado: mysqlEnum("resultado", ["encontrado", "nao_encontrado", "bloqueado"]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LogConsulta = typeof logsConsulta.$inferSelect;
export type InsertLogConsulta = typeof logsConsulta.$inferInsert;

// ─── Rate Limit ────────────────────────────────────────────────────────────
export const rateLimits = mysqlTable("rate_limits", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 128 }).notNull().unique(), // "ip:xxx" ou "cpf:xxx"
  contador: int("contador").default(1).notNull(),
  janelaInicio: timestamp("janela_inicio").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type RateLimit = typeof rateLimits.$inferSelect;
export type InsertRateLimit = typeof rateLimits.$inferInsert;

/// ─── Import Jobs (conciliação Judit) ───────────────────────────────────────
export const importJobs = mysqlTable("import_jobs", {
  id: int("id").autoincrement().primaryKey(),
  nomeArquivo: varchar("nome_arquivo", { length: 255 }),
  totalLinhas: int("total_linhas").default(0).notNull(),
  linhasImportadas: int("linhas_importadas").default(0).notNull(),
  linhasErro: int("linhas_erro").default(0).notNull(),
  linhasConciliadas: int("linhas_conciliadas").default(0).notNull(),
  linhasNaoEncontradas: int("linhas_nao_encontradas").default(0).notNull(),
  status: mysqlEnum("status", ["importando", "conciliando", "concluido", "erro"]).default("importando").notNull(),
  detalhes: json("detalhes"), // array de { linha, cnj, status, erro }
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ImportJob = typeof importJobs.$inferSelect;
export type InsertImportJob = typeof importJobs.$inferInsert;

// ─── Logs de Importação ──────────────────────────────────────────────
export const logsImportacao = mysqlTable("logs_importacao", {
  id: int("id").autoincrement().primaryKey(),
  nomeArquivo: varchar("nome_arquivo", { length: 255 }),
  totalLinhas: int("total_linhas").default(0).notNull(),
  linhasOk: int("linhas_ok").default(0).notNull(),
  linhasErro: int("linhas_erro").default(0).notNull(),
  detalhes: json("detalhes"), // array de { linha, erro, dados }
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LogImportacao = typeof logsImportacao.$inferSelect;
export type InsertLogImportacao = typeof logsImportacao.$inferInsert;

// ─── Judit Requests ────────────────────────────────────────────────────────
export const juditRequests = mysqlTable("judit_requests", {
  id: int("id").autoincrement().primaryKey(),
  cnj: varchar("cnj", { length: 30 }).notNull(),
  requestId: varchar("request_id", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["processing", "completed", "error"]).default("processing").notNull(),
  processoId: int("processo_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type JuditRequest = typeof juditRequests.$inferSelect;
export type InsertJuditRequest = typeof juditRequests.$inferInsert;

// ─── Judit Consulta Log ────────────────────────────────────────────────────
export const juditConsultaLog = mysqlTable("judit_consulta_log", {
  id: int("id").autoincrement().primaryKey(),
  processoCnj: varchar("processo_cnj", { length: 30 }).notNull(),
  requestId: varchar("request_id", { length: 128 }),
  tipo: mysqlEnum("tipo", ["consulta_avulsa", "importacao"]).default("consulta_avulsa").notNull(),
  custo: decimal("custo", { precision: 10, scale: 2 }).default("0.25").notNull(),
  status: mysqlEnum("status", ["sucesso", "nao_encontrado", "erro"]).default("sucesso").notNull(),
  aprovadoPorId: int("aprovado_por_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type JuditConsultaLog = typeof juditConsultaLog.$inferSelect;
export type InsertJuditConsultaLog = typeof juditConsultaLog.$inferInsert;

// ─── Manus LLM Log ────────────────────────────────────────────────────────
export const manusLlmLog = mysqlTable("manus_llm_log", {
  id: int("id").autoincrement().primaryKey(),
  processoCnj: varchar("processo_cnj", { length: 30 }).notNull(),
  solicitadoPor: int("solicitado_por").notNull(), // FK users.id (admin)
  solicitadoEm: timestamp("solicitado_em").defaultNow().notNull(),
  tokensEntrada: int("tokens_entrada"),           // nullable — se API retornar
  tokensSaida: int("tokens_saida"),               // nullable — se API retornar
  custoEstimado: decimal("custo_estimado", { precision: 10, scale: 6 }), // nullable
  modelo: varchar("modelo", { length: 128 }),     // nullable — modelo usado
  sucesso: boolean("sucesso").default(true).notNull(),
});
export type ManusLlmLog = typeof manusLlmLog.$inferSelect;
export type InsertManusLlmLog = typeof manusLlmLog.$inferInsert;

// ─── Logs de Importação Unificados ─────────────────────────────────────────
export const logsImportacaoUnificado = mysqlTable("logs_importacao_unificado", {
  id: int("id").autoincrement().primaryKey(),
  nomeArquivo: varchar("nome_arquivo", { length: 255 }),
  totalLinhas: int("total_linhas").default(0).notNull(),
  linhasImportadas: int("linhas_importadas").default(0).notNull(),
  linhasAtualizadas: int("linhas_atualizadas").default(0).notNull(),
  linhasErro: int("linhas_erro").default(0).notNull(),
  detalhes: json("detalhes"),
  importadoPorId: int("importado_por_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type LogImportacaoUnificado = typeof logsImportacaoUnificado.$inferSelect;
export type InsertLogImportacaoUnificado = typeof logsImportacaoUnificado.$inferInsert;
