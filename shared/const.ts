export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

export const STATUS_RESUMIDO_LABELS: Record<string, string> = {
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

export const STATUS_CORES: Record<string, string> = {
  em_analise_inicial: "bg-blue-100 text-blue-800",
  protocolado: "bg-indigo-100 text-indigo-800",
  em_andamento: "bg-yellow-100 text-yellow-800",
  aguardando_audiencia: "bg-orange-100 text-orange-800",
  aguardando_sentenca: "bg-amber-100 text-amber-800",
  em_recurso: "bg-purple-100 text-purple-800",
  cumprimento_de_sentenca: "bg-teal-100 text-teal-800",
  concluido_ganho: "bg-green-100 text-green-800",
  concluido_perdido: "bg-red-100 text-red-800",
  aguardando_documentos: "bg-gray-100 text-gray-800",
  acordo_negociacao: "bg-cyan-100 text-cyan-800",
  arquivado_encerrado: "bg-slate-100 text-slate-800",
};
