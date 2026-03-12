import {
  boolean,
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
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Parceiros / Escritórios ───────────────────────────────────────────────
export const parceiros = mysqlTable("parceiros", {
  id: int("id").autoincrement().primaryKey(),
  nomeEscritorio: varchar("nome_escritorio", { length: 255 }).notNull(),
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
  cpf: varchar("cpf", { length: 14 }).notNull().unique(), // formato: 000.000.000-00
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

// ─── Processos ─────────────────────────────────────────────────────────────
export const processos = mysqlTable("processos", {
  id: int("id").autoincrement().primaryKey(),
  cnj: varchar("cnj", { length: 30 }).notNull().unique(), // formato CNJ: 0000000-00.0000.0.00.0000
  clienteId: int("cliente_id").notNull(),
  parceiroId: int("parceiro_id"),
  advogado: varchar("advogado", { length: 255 }),
  statusResumido: mysqlEnum("status_resumido", STATUS_RESUMIDO).default("em_analise_inicial").notNull(),
  statusInterno: varchar("status_interno", { length: 255 }),
  monitoramentoAtivo: boolean("monitoramento_ativo").default(false).notNull(),
  codiloProcessoId: varchar("codilo_processo_id", { length: 128 }),
  ultimaAtualizacaoApi: timestamp("ultima_atualizacao_api"),
  rawPayload: json("raw_payload"),
  semAtualizacao7dias: boolean("sem_atualizacao_7dias").default(false).notNull(),
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

// ─── Logs de Importação ────────────────────────────────────────────────────
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
