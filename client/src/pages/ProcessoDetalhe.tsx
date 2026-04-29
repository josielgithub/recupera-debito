import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Scale,
  Building2,
  User,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Calendar,
  DollarSign,
  Gavel,
  BookOpen,
  Users,
  Activity,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  Sparkles,
  Bot,
  Download,
  FolderOpen,
  Stamp,
  ScrollText,
  Hammer,
  Paperclip,
  FileDown,
  Zap,
  TrendingUp,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useState as useStateIA } from "react";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";

// ─── Tipos do payload Judit ──────────────────────────────────────────────────
interface JuditStep {
  step_id?: string;
  step_date?: string;
  content?: string;
  step_type?: string;
  private?: boolean;
  steps_count?: number;
  lawsuit_cnj?: string;
  lawsuit_instance?: number;
}

interface JuditAttachment {
  attachment_id?: string;
  attachment_name?: string;
  attachment_date?: string;
  content?: string;
  status?: string;
  step_id?: string;
  tags?: { crawl_id?: string };
  user_data?: unknown;
}

interface JuditPayload {
  code?: string;
  name?: string;
  status?: string;
  phase?: string;
  situation?: string;
  area?: string;
  instance?: number;
  justice?: string;
  justice_description?: string;
  tribunal?: string;
  tribunal_acronym?: string;
  county?: string;
  city?: string;
  state?: string;
  amount?: number;
  free_justice?: boolean;
  secrecy_level?: number;
  distribution_date?: string;
  created_at?: string;
  updated_at?: string;
  classifications?: { code: string; name: string; date?: string }[];
  subjects?: { code: string; name: string }[];
  parties?: {
    name?: string;
    type?: string;
    doc?: string;
    lawyers?: { name?: string; doc?: string; oab?: string }[];
  }[];
  last_step?: JuditStep & { steps_count?: number };
  steps?: JuditStep[];
  courts?: { code: string; name: string }[];
  crawler?: { source_name?: string; updated_at?: string };
  attachments?: JuditAttachment[];
}
// ─── Mapeamento de tribunais ────────────────────────────────────────────────
const TRIBUNAL_MAP_DETALHE: Record<string, string> = {
  "8.05": "TJBA", "8.07": "TJCE", "8.10": "TJGO", "8.11": "TJMT",
  "8.12": "TJMS", "8.15": "TJMG", "8.16": "TJPR", "8.17": "TJPE",
  "8.18": "TJPB", "8.20": "TJRN", "8.22": "TJAL", "8.24": "TJSE",
  "8.25": "TJRO", "8.26": "TJSP",
};
// Tribunais com taxa de download < 20% (404 definitivo)
const TRIBUNAIS_SEM_DOWNLOAD = ["8.16", "8.05", "8.25"]; // TJPR, TJBA, TJRO

function extractCodigoTribunalCnj(cnj: string): string {
  const m = cnj.replace(/\D/g, "").match(/^\d{7}\d{2}\d{4}(\d)(\d{2})\d{4}$/);
  // Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO — posições 14-15 (0-indexed) = tribunal
  const digits = cnj.replace(/\D/g, "");
  if (digits.length === 20) {
    const j = digits[13]; // órgão
    const tt = digits.slice(14, 16); // tribunal
    return `${j}.${tt.replace(/^0/, "")}`.replace(/^(\d)\.(\d+)$/, (_, a, b) => `${a}.${parseInt(b)}`).replace(/^(\d)\.(\d)$/, "$1.0$2");
  }
  return "";
}

function getCodigoTribunalFormatado(cnj: string): string {
  const digits = cnj.replace(/\D/g, "");
  if (digits.length !== 20) return "";
  const j = digits[13];
  const tt = parseInt(digits.slice(14, 16));
  return `${j}.${tt}`;
}

function getSiglaTribunalDetalhe(cnj: string): string {
  const codigo = getCodigoTribunalFormatado(cnj);
  return TRIBUNAL_MAP_DETALHE[codigo] ?? codigo;
}

function isTribunalSemDownload(cnj: string): boolean {
  const codigo = getCodigoTribunalFormatado(cnj);
  return TRIBUNAIS_SEM_DOWNLOAD.includes(codigo);
}

function hasLongAttachmentIds(attachments: JuditAttachment[]): boolean {
  return attachments.some(a => a.attachment_id && String(a.attachment_id).length >= 9);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────────────────────
function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value?: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_RESUMIDO_LABELS[status] ?? status;
  const cor = STATUS_CORES[status] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cor}`}>
      {label}
    </span>
  );
}

function RequisicaoStatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return (
      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Concluída
      </Badge>
    );
  if (status === "processing")
    return (
      <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Processando
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 gap-1">
      <AlertCircle className="w-3 h-3" /> Erro
    </Badge>
  );
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

// ─── Componente de Timeline de Movimentações ─────────────────────────────────
function MovimentacoesTimeline({ cnj }: { cnj: string }) {
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(true);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = trpc.admin.processoMovimentacoes.useQuery(
    { cnj },
    { enabled: !!cnj, staleTime: 5 * 60 * 1000 }
  );

  const steps = data?.steps ?? [];
  const stepsFiltrados = busca.trim()
    ? steps.filter((s) =>
        s.content?.toLowerCase().includes(busca.toLowerCase()) ||
        s.step_type?.toLowerCase().includes(busca.toLowerCase()) ||
        formatDate(s.step_date).includes(busca)
      )
    : steps;

  const LIMITE_INICIAL = 10;
  const stepsExibidos = mostrarTodos ? stepsFiltrados : stepsFiltrados.slice(0, LIMITE_INICIAL);
  const temMais = stepsFiltrados.length > LIMITE_INICIAL && !mostrarTodos;

  // Agrupar por mês/ano
  function getGrupo(dateStr?: string): string {
    if (!dateStr) return "Data não informada";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    } catch {
      return "Data não informada";
    }
  }

  // Cor do ponto da timeline baseada no tipo de movimentação
  function getStepColor(step: JuditStep): string {
    const content = (step.content ?? "").toLowerCase();
    if (/distribu|protocol|inicial/.test(content)) return "bg-blue-500";
    if (/cita|intima|notif/.test(content)) return "bg-amber-500";
    if (/senten|decis|despacho|julgad/.test(content)) return "bg-purple-500";
    if (/recurso|apela|agravo|embarg/.test(content)) return "bg-orange-500";
    if (/arquiv|extint|encerr|baixa/.test(content)) return "bg-red-500";
    if (/acordo|concilia|negocia/.test(content)) return "bg-green-500";
    if (/cumprimento|execu/.test(content)) return "bg-teal-500";
    if (/audiencia|pauta/.test(content)) return "bg-indigo-500";
    return "bg-slate-400";
  }

  if (isLoading || isFetching) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Histórico de Movimentações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Buscando movimentações na Judit...
          </div>
          <div className="space-y-3 mt-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-2 h-2 rounded-full mt-2 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Histórico de Movimentações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Erro ao buscar movimentações.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Histórico de Movimentações
            {steps.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {steps.length} {steps.length === 1 ? "movimentação" : "movimentações"}
              </Badge>
            )}
            {data?.fromCache === false && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                <RefreshCw className="w-2.5 h-2.5 mr-1" /> Atualizado agora
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('atualizarProcessoJudit', { detail: { cnj } }))}
              className="gap-1.5 text-xs h-7"
            >
              <RefreshCw className="w-3 h-3" />
              Atualizar na Judit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 text-xs h-7"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandido((v) => !v)}
              className="h-7 w-7 p-0"
            >
              {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expandido && (
        <CardContent>
          {steps.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Info className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhuma movimentação encontrada para este processo.
              </p>
              <p className="text-xs text-muted-foreground">
                O processo pode ainda não ter sido atualizado pela Judit.
              </p>
            </div>
          ) : (
            <>
              {/* Barra de busca */}
              {steps.length > 5 && (
                <div className="relative mb-4">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar movimentações..."
                    value={busca}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      setMostrarTodos(true);
                    }}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              )}

              {/* Resultado da busca */}
              {busca && (
                <p className="text-xs text-muted-foreground mb-3">
                  {stepsFiltrados.length === 0
                    ? "Nenhuma movimentação encontrada para este filtro."
                    : `${stepsFiltrados.length} movimentação(ões) encontrada(s)`}
                </p>
              )}

              {/* Timeline */}
              <div className="relative">
                {/* Linha vertical da timeline */}
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-0">
                  {stepsExibidos.map((step, i) => {
                    const isFirst = i === 0;
                    const grupoAtual = getGrupo(step.step_date);
                    const grupoPrevio = i > 0 ? getGrupo(stepsExibidos[i - 1].step_date) : null;
                    const mostrarGrupo = isFirst || grupoAtual !== grupoPrevio;

                    return (
                      <div key={step.step_id ?? i}>
                        {/* Separador de mês */}
                        {mostrarGrupo && !busca && (
                          <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0 pl-6">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              {grupoAtual}
                            </span>
                          </div>
                        )}

                        {/* Item da timeline */}
                        <div className="flex gap-3 pb-4 relative">
                          {/* Ponto da timeline */}
                          <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 z-10 ${getStepColor(step)}`} />

                          {/* Conteúdo */}
                          <div className="flex-1 min-w-0 pb-1">
                            <p className="text-sm text-foreground leading-snug">
                              {step.content ?? "Sem descrição"}
                              {step.private && (
                                <Badge variant="outline" className="ml-2 text-xs py-0 px-1">Sigiloso</Badge>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {step.step_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDateTime(step.step_date)}
                                </span>
                              )}
                              {step.step_type && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  Tipo: {step.step_type}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Botão "Ver mais" */}
                {temMais && (
                  <div className="pl-6 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMostrarTodos(true)}
                      className="gap-2 text-xs h-8"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      Ver mais {stepsFiltrados.length - LIMITE_INICIAL} movimentações
                    </Button>
                  </div>
                )}

                {/* Botão "Ver menos" */}
                {mostrarTodos && stepsFiltrados.length > LIMITE_INICIAL && !busca && (
                  <div className="pl-6 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMostrarTodos(false)}
                      className="gap-2 text-xs h-8 text-muted-foreground"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                      Ver menos
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/// ─── Componente de Valor Obtido ───────────────────────────────────────────
function ValorObtidoCard({
  cnj,
  valorInicial,
  valorUpdatedAt,
}: {
  cnj: string;
  valorInicial?: string | number | null;
  valorUpdatedAt?: string | null;
}) {
  const utils = trpc.useUtils();
  const [editando, setEditando] = useStateIA(false);
  const [inputValor, setInputValor] = useStateIA("");
  const [iaFonte, setIaFonte] = useStateIA<string | null>(null);
  const [iaConfianca, setIaConfianca] = useStateIA<string | null>(null);

  const valorAtual = valorInicial != null ? Number(valorInicial) : null;

  const extrairMutation = trpc.admin.extrairValorObtidoIA.useMutation({
    onSuccess: (data) => {
      setIaFonte(data.fonte);
      setIaConfianca(data.confianca);
      if (data.valor !== null) {
        setInputValor(String(data.valor));
      }
      utils.admin.processoDetalhe.invalidate({ cnj });
    },
  });

  const salvarMutation = trpc.admin.atualizarValorObtido.useMutation({
    onSuccess: () => {
      setEditando(false);
      setIaFonte(null);
      setIaConfianca(null);
      utils.admin.processoDetalhe.invalidate({ cnj });
    },
  });

  const handleSalvar = () => {
    const num = parseFloat(inputValor.replace(",", "."));
    salvarMutation.mutate({ cnj, valorObtido: isNaN(num) ? null : num });
  };

  const handleLimpar = () => {
    salvarMutation.mutate({ cnj, valorObtido: null });
    setInputValor("");
  };

  const confiancaColor = iaConfianca === "alta" ? "text-green-600" : iaConfianca === "media" ? "text-amber-600" : "text-red-500";

  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Valor Obtido
            {valorAtual !== null && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 ml-1">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorAtual)}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => extrairMutation.mutate({ cnj })}
              disabled={extrairMutation.isPending}
            >
              {extrairMutation.isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Extraindo...</>
              ) : (
                <><Sparkles className="w-3 h-3" /> Extrair via IA</>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => { setEditando((v) => !v); setInputValor(valorAtual !== null ? String(valorAtual) : ""); }}
            >
              {editando ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {editando ? "Fechar" : "Editar"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sugestão da IA */}
        {iaFonte && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-1">
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Sugestão da IA{" "}
              <span className={`font-semibold ${confiancaColor}`}>
                (confiança: {iaConfianca})
              </span>
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">{iaFonte}</p>
            {inputValor && (
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Valor sugerido: R$ {parseFloat(inputValor.replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
        )}
        {/* Campo de edição manual */}
        {editando && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input
                className="pl-9"
                placeholder="0,00"
                value={inputValor}
                onChange={(e) => setInputValor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSalvar()}
              />
            </div>
            <Button size="sm" onClick={handleSalvar} disabled={salvarMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {salvarMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
            </Button>
            {valorAtual !== null && (
              <Button size="sm" variant="outline" onClick={handleLimpar} disabled={salvarMutation.isPending} className="text-red-600 border-red-300 hover:bg-red-50">
                Limpar
              </Button>
            )}
          </div>
        )}
        {/* Estado vazio */}
        {valorAtual === null && !editando && !extrairMutation.isPending && !iaFonte && (
          <p className="text-sm text-muted-foreground py-2">
            Nenhum valor registrado. Use <strong>Extrair via IA</strong> para detectar automaticamente ou <strong>Editar</strong> para inserir manualmente.
          </p>
        )}
        {valorAtual !== null && !editando && (
          <div className="text-xs text-muted-foreground">
            Registrado em {valorUpdatedAt ? new Date(valorUpdatedAt).toLocaleDateString("pt-BR") : "data desconhecida"}
          </div>
        )}
        {(extrairMutation.error || salvarMutation.error) && (
          <p className="text-xs text-destructive">
            {extrairMutation.error?.message ?? salvarMutation.error?.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers de categorização de documentos ─────────────────────────────────
function categorizarDocumento(att: JuditAttachment): {
  tipo: "sentenca" | "alvara" | "decisao" | "mandado" | "acordao" | "certidao" | "peticao" | "outro";
  label: string;
  cor: string;
  icone: "sentenca" | "alvara" | "decisao" | "mandado" | "acordao" | "certidao" | "peticao" | "outro";
} {
  const nome = ((att.attachment_name ?? att.content ?? "")).toLowerCase();
  if (/senten/i.test(nome)) return { tipo: "sentenca", label: "Sentença", cor: "bg-purple-100 text-purple-800 border-purple-200", icone: "sentenca" };
  if (/alvar/i.test(nome)) return { tipo: "alvara", label: "Alvará", cor: "bg-green-100 text-green-800 border-green-200", icone: "alvara" };
  if (/decis/i.test(nome)) return { tipo: "decisao", label: "Decisão", cor: "bg-blue-100 text-blue-800 border-blue-200", icone: "decisao" };
  if (/mandado/i.test(nome)) return { tipo: "mandado", label: "Mandado", cor: "bg-orange-100 text-orange-800 border-orange-200", icone: "mandado" };
  if (/acórd|acordao/i.test(nome)) return { tipo: "acordao", label: "Acórdão", cor: "bg-indigo-100 text-indigo-800 border-indigo-200", icone: "acordao" };
  if (/certid/i.test(nome)) return { tipo: "certidao", label: "Certidão", cor: "bg-slate-100 text-slate-700 border-slate-200", icone: "certidao" };
  if (/peti/i.test(nome)) return { tipo: "peticao", label: "Petição", cor: "bg-amber-100 text-amber-800 border-amber-200", icone: "peticao" };
  return { tipo: "outro", label: "Documento", cor: "bg-gray-100 text-gray-700 border-gray-200", icone: "outro" };
}

function DocIcon({ tipo }: { tipo: string }) {
  if (tipo === "sentenca") return <ScrollText className="w-4 h-4" />;
  if (tipo === "alvara") return <Stamp className="w-4 h-4" />;
  if (tipo === "decisao") return <Gavel className="w-4 h-4" />;
  if (tipo === "mandado") return <Hammer className="w-4 h-4" />;
  if (tipo === "acordao") return <BookOpen className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}
// ─── Componente Unificado de Documentos ──────────────────────────────────────────
function DocumentosCard({
  attachments,
  processoId,
  autosDisponiveis,
  autosJaSolicitados,
  cnj,
}: {
  attachments: JuditAttachment[];
  processoId?: number;
  autosDisponiveis?: boolean;
  autosJaSolicitados?: boolean;
  cnj?: string;
}) {
  const sigla = cnj ? getSiglaTribunalDetalhe(cnj) : "";
  const semDownload = cnj ? isTribunalSemDownload(cnj) : false;
  const temIdLongo = hasLongAttachmentIds(attachments);
  const utils = trpc.useUtils();
  const [expandido, setExpandido] = useState(true);
  const [filtro, setFiltro] = useState<string>("todos");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [baixandoTodos, setBaixandoTodos] = useState(false);
  const [progressoBaixarTodos, setProgressoBaixarTodos] = useState<{ atual: number; total: number } | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [extraindoId, setExtraindoId] = useState<number | null>(null);
  const [dadosSentenca, setDadosSentenca] = useState<Record<number, any>>({});

  const extrairDadosMutation = trpc.admin.extrairDadosDocumento.useMutation({
    onSuccess: (result, variables) => {
      setExtraindoId(null);
      setDadosSentenca((prev) => ({ ...prev, [variables.processoAutosId]: result.dados }));
      toast.success("Dados extraídos com sucesso!");
    },
    onError: (err) => {
      setExtraindoId(null);
      toast.error("Erro ao extrair dados: " + err.message);
    },
  });

  function handleExtrairDados(auto: any) {
    if (!processoId || !auto.urlS3) return;
    const tipo = categorizarDocumento({ attachment_name: auto.nomeArquivo } as JuditAttachment).tipo as "sentenca" | "alvara";
    setExtraindoId(auto.id);
    extrairDadosMutation.mutate({
      processoAutosId: auto.id,
      urlS3: auto.urlS3,
      tipo,
      processoId,
    });
  }

  // Buscar registros da tabela processo_autos (todos os documentos: disponíveis, pending, com erro)
  const { data: autos, isLoading: autosLoading } = trpc.admin.getAutosProcesso.useQuery(
    { processoId: processoId! },
    { enabled: !!processoId }
  );

  const downloadMutation = trpc.admin.downloadAnexo.useMutation({
    onSuccess: (result, variables) => {
      utils.admin.getAutosProcesso.setData({ processoId: processoId! }, (old: any) => {
        if (!old) return old;
        return old.map((a: any) =>
          a.id === variables.autoId ? { ...a, urlS3: result.url } : a
        );
      });
      window.open(result.url, "_blank");
      setDownloadingId(null);
    },
    onError: (err) => {
      setDownloadingId(null);
      toast.error("Erro ao baixar arquivo: " + err.message);
    },
  });

  const verificarPendentesMutation = trpc.admin.verificarAutosPendentes.useMutation({
    onSuccess: (result) => {
      setVerificando(false);
      utils.admin.getAutosProcesso.invalidate({ processoId: processoId! });
      if (result.atualizados > 0) {
        toast.success(result.mensagem);
      } else {
        toast.info(result.mensagem);
      }
    },
    onError: (err) => {
      setVerificando(false);
      toast.error("Erro ao verificar documentos: " + err.message);
    },
  });

  // Helpers de formatação
  function formatBytes(bytes?: number): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Badge colorido por extensão de arquivo
  function ExtBadge({ ext }: { ext?: string }) {
    if (!ext) return null;
    const e = ext.toLowerCase();
    let cls = "text-xs uppercase px-1.5 py-0 h-4 font-mono border-0 ";
    if (e === "pdf") cls += "bg-red-100 text-red-700";
    else if (e === "docx" || e === "doc") cls += "bg-blue-100 text-blue-700";
    else if (e === "html" || e === "htm") cls += "bg-green-100 text-green-700";
    else cls += "bg-gray-100 text-gray-600";
    return <Badge className={cls}>{e}</Badge>;
  }

  // Badge colorido por instância
  function InstanciaBadge({ instancia }: { instancia?: number | null }) {
    if (!instancia) return null;
    const labels: Record<number, string> = { 1: "1ª inst.", 2: "2ª inst.", 3: "3ª inst." };
    const colors: Record<number, string> = {
      1: "bg-blue-100 text-blue-700",
      2: "bg-purple-100 text-purple-700",
      3: "bg-green-100 text-green-700",
    };
    const label = labels[instancia] ?? `${instancia}ª inst.`;
    const color = colors[instancia] ?? "bg-gray-100 text-gray-600";
    return <Badge className={`text-xs px-1.5 py-0 h-4 border-0 ${color}`}>{label}</Badge>;
  }

  // Determinar o status visual de um registro de auto
  function getStatusAuto(auto: any): "disponivel" | "processando" | "aguardando" | "indisponivel" {
    if (auto.urlS3 && auto.urlS3.trim().length > 0) return "disponivel";
    if (auto.downloadErro) return "indisponivel";
    if (auto.statusAnexo === "done") return "processando";
    return "aguardando"; // pending ou outro
  }

  // Construir lista unificada: registros do banco + itens do payload sem registro
  const autosArr = (autos as any[]) ?? [];
  const autosMapById = new Map<string, any>();
  const autosMapByName = new Map<string, any>();
  for (const a of autosArr) {
    if (a.attachmentId) autosMapById.set(String(a.attachmentId), a);
    if (a.nomeArquivo) autosMapByName.set(a.nomeArquivo.trim().toUpperCase(), a);
  }

  // Itens do payload Judit que não têm registro no banco
  const attachmentsSemRegistro = (attachments ?? []).filter(att => {
    const id = att.attachment_id ? String(att.attachment_id) : undefined;
    const nome = (att.attachment_name ?? att.content ?? "").trim().toUpperCase();
    return !(id && autosMapById.has(id)) && !autosMapByName.has(nome);
  });

  // Contadores para o header
  const totalDisponiveis = autosArr.filter((a: any) => a.urlS3 && a.urlS3.trim().length > 0).length;
  const totalAguardando = autosArr.filter((a: any) => !a.urlS3 && !a.downloadErro).length;
  const totalIndisponiveis = autosArr.filter((a: any) => !!a.downloadErro).length;
  const totalNaoBaixados = autosArr.filter((a: any) => {
    const isIndisp = a.statusAnexo === "error" || a.statusAnexo === "corrupted" || !!a.downloadErro;
    const hasUrl = a.urlS3 && a.urlS3.trim().length > 0;
    return !isIndisp && !hasUrl && a.statusAnexo === "done";
  }).length;
  const hasPending = autosArr.some((a: any) => !a.urlS3 && !a.downloadErro);

  // Ordenar registros do banco: disponíveis primeiro, depois aguardando, depois indisponíveis
  const autosOrdenados = [...autosArr].sort((a: any, b: any) => {
    const ordem = { disponivel: 0, processando: 1, aguardando: 2, indisponivel: 3 };
    return (ordem[getStatusAuto(a)] ?? 4) - (ordem[getStatusAuto(b)] ?? 4);
  });

  // Filtros
  const PRIORIDADE = ["sentenca", "alvara", "decisao", "mandado", "acordao"];
  const relevantes = (attachments ?? []).filter(a => PRIORIDADE.includes(categorizarDocumento(a).tipo));

  // Baixar todos os documentos do Caso 2 (done sem URL) sequencialmente
  async function baixarTodos() {
    if (!autos) return;
    const pendentes = (autos as any[]).filter((a: any) => {
      const isIndisp = a.statusAnexo === "error" || a.statusAnexo === "corrupted" || !!a.downloadErro;
      const hasUrl = a.urlS3 && a.urlS3.trim().length > 0;
      return !isIndisp && !hasUrl && a.statusAnexo === "done";
    });
    if (pendentes.length === 0) return;
    setBaixandoTodos(true);
    setProgressoBaixarTodos({ atual: 0, total: pendentes.length });
    let sucesso = 0;
    let falha = 0;
    for (let i = 0; i < pendentes.length; i++) {
      const auto = pendentes[i];
      setProgressoBaixarTodos({ atual: i + 1, total: pendentes.length });
      try {
        const result = await new Promise<{ url: string }>((resolve, reject) => {
          downloadMutation.mutate(
            { processoId: processoId!, autoId: auto.id },
            { onSuccess: resolve, onError: reject }
          );
        });
        utils.admin.getAutosProcesso.setData({ processoId: processoId! }, (old: any) => {
          if (!old) return old;
          return old.map((a: any) => a.id === auto.id ? { ...a, urlS3: result.url } : a);
        });
        sucesso++;
      } catch {
        falha++;
      }
    }
    setBaixandoTodos(false);
    setProgressoBaixarTodos(null);
    if (falha === 0) {
      toast.success(`${sucesso} documento${sucesso !== 1 ? "s" : ""} baixado${sucesso !== 1 ? "s" : ""} com sucesso`);
    } else {
      toast.warning(`${sucesso} baixado${sucesso !== 1 ? "s" : ""}, ${falha} com erro`);
    }
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <FolderOpen className="w-4 h-4 text-blue-500" />
            Documentos
            {autosLoading && processoId ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            ) : (
              <>
                {totalDisponiveis > 0 && (
                  <Badge className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                    {totalDisponiveis} disponíve{totalDisponiveis === 1 ? "l" : "is"}
                  </Badge>
                )}
                {totalAguardando > 0 && (
                  <Badge className="text-xs bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100">
                    {totalAguardando} aguardando
                  </Badge>
                )}
                {totalIndisponiveis > 0 && (
                  <Badge className="text-xs bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                    {totalIndisponiveis} indisponível{totalIndisponiveis !== 1 ? "is" : ""}
                  </Badge>
                )}
                {autosArr.length === 0 && (attachments ?? []).length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {attachments.length} identificado{attachments.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasPending && processoId && !semDownload && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 bg-background"
                disabled={verificando}
                onClick={() => {
                  setVerificando(true);
                  if (temIdLongo) {
                    toast.info("Tentando download mesmo com status pendente — aguarde alguns instantes");
                  }
                  verificarPendentesMutation.mutate({ processoId: processoId! });
                }}
              >
                {verificando ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Verificando...</>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" />Verificar novamente</>
                )}
              </Button>
            )}
            {totalNaoBaixados > 0 && processoId && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 bg-background"
                disabled={baixandoTodos || !!downloadingId}
                onClick={baixarTodos}
              >
                {baixandoTodos && progressoBaixarTodos ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Baixando {progressoBaixarTodos.atual} de {progressoBaixarTodos.total}...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Baixar todos ({totalNaoBaixados})
                  </>
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandido((v) => !v)}
              className="h-7 w-7 p-0"
            >
              {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expandido && (
        <CardContent>
          {autosArr.length > 0 ? (
            <div className="space-y-2">
              {autosOrdenados.map((auto: any) => {
                const status = getStatusAuto(auto);
                const isDownloading = downloadingId === auto.id;
                const cat = categorizarDocumento({ attachment_name: auto.nomeArquivo } as JuditAttachment);
                return (
                  <div
                    key={auto.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className={`shrink-0 mt-0.5 p-1.5 rounded-md border ${cat.cor}`}>
                      <DocIcon tipo={cat.tipo} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-sm font-medium text-foreground truncate max-w-xs">{auto.nomeArquivo ?? "Documento sem nome"}</span>
                        {auto.extensao && <ExtBadge ext={auto.extensao} />}
                        {auto.instancia && <InstanciaBadge instancia={auto.instancia} />}
                        {status === "disponivel" && (
                          <Badge className="text-xs bg-green-100 text-green-700 border-0 px-1.5 py-0 h-4">Disponível</Badge>
                        )}
                        {status === "processando" && (
                          <Badge className="text-xs bg-amber-100 text-amber-700 border-0 px-1.5 py-0 h-4">Processando download</Badge>
                        )}
                        {status === "aguardando" && (
                          <Badge className="text-xs bg-gray-100 text-gray-600 border-0 px-1.5 py-0 h-4">Aguardando Judit</Badge>
                        )}
                        {status === "indisponivel" && (
                          <Badge
                            className="text-xs bg-red-100 text-red-700 border-0 px-1.5 py-0 h-4 cursor-help"
                            title={auto.downloadErro ?? "Erro desconhecido"}
                          >
                            Indisponível
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {auto.dataDocumento && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDateTime(auto.dataDocumento)}
                          </span>
                        )}
                        {auto.attachmentId && (
                          <span className="font-mono opacity-60">ID: {auto.attachmentId}</span>
                        )}
                        {auto.tamanhoBytes && <span>{formatBytes(auto.tamanhoBytes)}</span>}
                        {status === "indisponivel" && auto.downloadErro && (
                          <span className="text-red-500 truncate max-w-xs" title={auto.downloadErro}>{auto.downloadErro}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-1.5">
                      {status === "disponivel" && (
                        <>
                          <a href={auto.urlS3} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 bg-green-50 border-green-300 text-green-700 hover:bg-green-100">
                              <ExternalLink className="w-3 h-3" />
                              Abrir
                            </Button>
                          </a>
                          <a href={auto.urlS3} download>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 bg-background">
                              <Download className="w-3 h-3" />
                              Baixar
                            </Button>
                          </a>
                          {(categorizarDocumento({ attachment_name: auto.nomeArquivo } as JuditAttachment).tipo === "sentenca" ||
                            categorizarDocumento({ attachment_name: auto.nomeArquivo } as JuditAttachment).tipo === "alvara") && processoId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                              disabled={extraindoId === auto.id}
                              onClick={() => handleExtrairDados(auto)}
                              title="Extrair dados estruturados via IA (valor, resultado, data)"
                            >
                              {extraindoId === auto.id ? (
                                <><Loader2 className="w-3 h-3 animate-spin" />Extraindo...</>
                              ) : (
                                <><Zap className="w-3 h-3" />Extrair</>
                              )}
                            </Button>
                          )}
                        </>
                      )}
                      {status === "processando" && processoId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 bg-background"
                          disabled={isDownloading || baixandoTodos}
                          onClick={() => {
                            setDownloadingId(auto.id);
                            downloadMutation.mutate({ processoId: processoId!, autoId: auto.id });
                          }}
                          title="Baixar da Judit e salvar no S3"
                        >
                          {isDownloading ? (
                            <><Loader2 className="w-3 h-3 animate-spin" />Baixando...</>
                          ) : (
                            <><Download className="w-3 h-3" />Baixar</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {attachmentsSemRegistro.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground pt-1 pb-0.5 font-medium">Documentos identificados no payload (sem registro no banco):</p>
                  {attachmentsSemRegistro.map((att: any, i: number) => {
                    const cat = categorizarDocumento(att);
                    const nomeJudit = att.attachment_name ?? att.content ?? "Documento sem nome";
                    const ext = nomeJudit.split(".").pop()?.toLowerCase();
                    return (
                      <div key={att.attachment_id ?? `sem-${i}`} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/10 opacity-70">
                        <div className={`shrink-0 mt-0.5 p-1.5 rounded-md border ${cat.cor}`}>
                          <DocIcon tipo={cat.tipo} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="text-sm font-medium text-foreground truncate max-w-xs">{nomeJudit}</span>
                            {ext && <ExtBadge ext={ext} />}
                            <Badge className="text-xs bg-gray-100 text-gray-500 border-0 px-1.5 py-0 h-4">Sem registro</Badge>
                          </div>
                          {att.attachment_id && (
                            <span className="text-xs font-mono opacity-50">ID: {att.attachment_id}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {(attachments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum documento encontrado.</p>
              ) : (
                (attachments ?? []).map((att, i) => {
                  const cat = categorizarDocumento(att);
                  const nomeJudit = att.attachment_name ?? att.content ?? "Documento sem nome";
                  const ext = nomeJudit.split(".").pop()?.toLowerCase();
                  return (
                    <div key={att.attachment_id ?? i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className={`shrink-0 mt-0.5 p-1.5 rounded-md border ${cat.cor}`}>
                        <DocIcon tipo={cat.tipo} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-medium text-foreground truncate max-w-xs">{nomeJudit}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cat.cor}`}>{cat.label}</span>
                          {ext && <ExtBadge ext={ext} />}
                          {autosJaSolicitados ? (
                            <Badge className="text-xs bg-gray-100 text-gray-600 border-0 px-1.5 py-0 h-4">Aguardando Judit</Badge>
                          ) : (
                            <Badge className="text-xs bg-amber-100 text-amber-700 border-0 px-1.5 py-0 h-4">Solicitar</Badge>
                          )}
                        </div>
                        {att.attachment_date && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />{formatDateTime(att.attachment_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {hasPending && processoId && (
            <div className="mt-3 pt-3 border-t">
              {semDownload ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-800">
                      Documentos identificados, mas download não disponível para o tribunal {sigla || "deste processo"} ainda.
                    </p>
                    <p className="text-xs text-red-700 mt-0.5">
                      Entre em contato com o suporte da Judit para habilitar o download para este tribunal.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    {totalAguardando} documento{totalAguardando !== 1 ? "s" : ""} aguardando{temIdLongo ? " — tentando download mesmo com status pendente" : " processamento pela Judit"}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={verificando}
                    onClick={() => {
                      setVerificando(true);
                      verificarPendentesMutation.mutate({ processoId: processoId! });
                    }}
                  >
                    {verificando ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Verificando na Judit...</>
                    ) : (
                      <><RefreshCw className="w-3.5 h-3.5" />Verificar novamente</>
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Componente Dados da Sentença / Alvará (extraídos via IA) ──────────────────────────────────────
function DadosSentencaCard({ processoId }: { processoId: number }) {
  const [expandido, setExpandido] = useState(true);
  const { data: registros, isLoading } = trpc.admin.dadosSentencaProcesso.useQuery({ processoId });

  if (isLoading) return null;
  if (!registros || registros.length === 0) return null;

  function formatValor(v: string | null | undefined) {
    if (!v) return null;
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  }

  function ConfiancaBadge({ c }: { c: string | null | undefined }) {
    if (!c) return null;
    const cls = c === "alta" ? "bg-green-100 text-green-800 border-green-200" :
                c === "media" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                "bg-red-100 text-red-700 border-red-200";
    return <Badge className={`text-xs ${cls} hover:${cls}`}>{c === "alta" ? "Alta" : c === "media" ? "Média" : "Baixa"} confiança</Badge>;
  }

  function ResultadoBadge({ r }: { r: string | null | undefined }) {
    if (!r) return null;
    const map: Record<string, { label: string; cls: string }> = {
      procedente: { label: "Procedente", cls: "bg-green-100 text-green-800 border-green-200" },
      improcedente: { label: "Improcedente", cls: "bg-red-100 text-red-700 border-red-200" },
      parcialmente_procedente: { label: "Parcialmente procedente", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      nao_identificado: { label: "Não identificado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
    };
    const info = map[r] ?? { label: r, cls: "bg-gray-100 text-gray-600 border-gray-200" };
    return <Badge className={`text-xs ${info.cls} hover:${info.cls}`}>{info.label}</Badge>;
  }

  return (
    <Card className="border-purple-200 dark:border-purple-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-500" />
            Dados Extraídos via IA
            <Badge className="text-xs bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100">
              {registros.length} documento{registros.length !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setExpandido((v) => !v)} className="h-7 w-7 p-0">
            {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      {expandido && (
        <CardContent className="space-y-4">
          {registros.map((reg: any) => (
            <div key={reg.id} className="rounded-lg border bg-muted/10 p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {reg.tipo === "sentenca" ? (
                  <Badge className="text-xs bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100"><ScrollText className="w-3 h-3 mr-1" />Sentença</Badge>
                ) : (
                  <Badge className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100"><Stamp className="w-3 h-3 mr-1" />Alvará</Badge>
                )}
                <ConfiancaBadge c={reg.confianca} />
                {reg.resultado && <ResultadoBadge r={reg.resultado} />}
                {reg.cabeRecurso === true && <Badge className="text-xs bg-orange-100 text-orange-800 border-orange-200">Cabe recurso</Badge>}
                {reg.cabeRecurso === false && <Badge className="text-xs bg-gray-100 text-gray-600 border-gray-200">Sem recurso</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">
                  Extraído em {reg.criadoEm ? new Date(reg.criadoEm).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                {reg.valorSentenca && (
                  <div>
                    <p className="text-xs text-muted-foreground">Valor da sentença</p>
                    <p className="text-sm font-semibold text-green-700">{formatValor(reg.valorSentenca)}</p>
                  </div>
                )}
                {reg.dataSentenca && (
                  <div>
                    <p className="text-xs text-muted-foreground">Data da sentença</p>
                    <p className="text-sm font-medium">{new Date(reg.dataSentenca).toLocaleDateString("pt-BR")}</p>
                  </div>
                )}
                {reg.valorAlvara && (
                  <div>
                    <p className="text-xs text-muted-foreground">Valor do alvará</p>
                    <p className="text-sm font-semibold text-green-700">{formatValor(reg.valorAlvara)}</p>
                  </div>
                )}
                {reg.dataDepositoAlvara && (
                  <div>
                    <p className="text-xs text-muted-foreground">Data depósito alvará</p>
                    <p className="text-sm font-medium">{new Date(reg.dataDepositoAlvara).toLocaleDateString("pt-BR")}</p>
                  </div>
                )}
                {reg.modeloUsado && (
                  <div>
                    <p className="text-xs text-muted-foreground">Modelo IA</p>
                    <p className="text-xs font-mono text-muted-foreground">{reg.modeloUsado}</p>
                  </div>
                )}
              </div>
              {reg.textoExtraido && (
                <div className="rounded-md bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Trecho relevante extraído</p>
                  <p className="text-xs text-foreground italic">"{reg.textoExtraido}"</p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Componente de Análise IA ──────────────────────────────────────────────
function AnaliseIACard({
  cnj,
  aiSummaryInicial,
  aiSummaryUpdatedAt,
}: {
  cnj: string;
  aiSummaryInicial?: string | null;
  aiSummaryUpdatedAt?: string | null;
}) {
  const [summary, setSummary] = useStateIA<string | null>(aiSummaryInicial ?? null);
  const [updatedAt, setUpdatedAt] = useStateIA<string | null>(aiSummaryUpdatedAt ?? null);
  const [expandido, setExpandido] = useStateIA(!!aiSummaryInicial);
  const [gerarError, setGerarError] = useStateIA<string | null>(null);

  const utils = trpc.useUtils();

  // Claude IA: resposta sincrona com Claude Haiku
  const iniciarMutation = trpc.admin.analisarProcessoIA.useMutation({
    onSuccess: (data) => {
      if (data.analise) {
        const analiseFormatada = `
**Situacao Atual:** ${data.analise.situacaoAtual}

**Ultima Movimentacao:** ${data.analise.ultimaMovimentacao}

**Proximo Passo:** ${data.analise.proximoPasso}

**Perspectiva:** ${data.analise.perspectiva}

---
*Custo estimado: ${data.custoEstimado}*
        `.trim();
        setSummary(analiseFormatada);
        setUpdatedAt(new Date().toISOString());
        setExpandido(true);
        setGerarError(null);
        utils.admin.processoDetalhe.invalidate({ cnj });
      }
    },
    onError: (err) => {
      setGerarError(err.message);
    },
  });

  const isLoading = iniciarMutation.isPending;
  const error = gerarError ? { message: gerarError } : iniciarMutation.error;

  return (
    <Card className="border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-500" />
            <span>Análise IA</span>
            <span className="text-xs font-normal text-muted-foreground bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded-full">Beta</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {updatedAt && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Gerado em {formatDateTime(updatedAt)}
              </span>
            )}
            <Button
              size="sm"
              variant={summary ? "outline" : "default"}
              className={summary ? "gap-1.5 text-xs h-7" : "gap-1.5 text-xs h-7 bg-violet-600 hover:bg-violet-700 text-white"}
              onClick={() => iniciarMutation.mutate({ cnj })}
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Gerando análise...</>
              ) : summary ? (
                <><RefreshCw className="w-3 h-3" /> Regenerar</>
              ) : (
                <><Sparkles className="w-3 h-3" /> Gerar Análise IA</>
              )}
            </Button>
            {summary && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandido((v) => !v)}
                className="h-7 w-7 p-0"
              >
                {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {expandido && summary && (
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <Streamdown>{summary}</Streamdown>
          </div>
        </CardContent>
      )}

      {!summary && !isLoading && (
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Sparkles className="w-8 h-8 text-violet-400" />
            <p className="text-sm text-muted-foreground">
              Clique em <strong>Gerar Resumo IA</strong> para obter um resumo inteligente deste processo gerado automaticamente.
            </p>
            <p className="text-xs text-muted-foreground">
              O resumo inclui situação atual, partes envolvidas, cronologia e perspectiva do processo. Gerado em segundos.
            </p>
          </div>
        </CardContent>
      )}

      {isLoading && (
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-muted-foreground">Gerando resumo com IA...</p>
            <p className="text-xs text-muted-foreground">Isso leva apenas alguns segundos.</p>
          </div>
        </CardContent>
      )}

      {error && (
        <CardContent>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Erro ao gerar análise: {error.message}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function ProcessoDetalhe() {
  const params = useParams<{ cnj: string }>();
  const cnj = decodeURIComponent(params.cnj ?? "");
  const utils = trpc.useUtils();

  // ─── Estado de polling para download individual ───────────────────────────
  const [pollingRequestId, setPollingRequestId] = useState<string | null>(null);
  const [pollingTentativa, setPollingTentativa] = useState(0);
  const MAX_TENTATIVAS = 20;

  const iniciarDownloadMutation = trpc.admin.iniciarDownloadAutos.useMutation({
    onSuccess: (result) => {
      setPollingRequestId(result.requestId);
      setPollingTentativa(1);
      toast.info(`Requisição enviada para a Judit. Aguardando processamento...`);
    },
    onError: (err) => {
      toast.error(`Erro ao iniciar download: ${err.message}`);
    },
  });

  const verificarResultadoMutation = trpc.admin.verificarResultadoAutos.useMutation({
    onSuccess: (result) => {
      if (result.status === "processing") {
        // Ainda processando — continua o polling
        return;
      }
      // Resultado chegou — parar polling
      setPollingRequestId(null);
      setPollingTentativa(0);
      if (result.status === "done" && result.baixados > 0 && (result.pendentes ?? 0) > 0) {
        toast.success(`${result.baixados} documento${result.baixados !== 1 ? "s" : ""} baixado${result.baixados !== 1 ? "s" : ""} com sucesso! ${result.pendentes} ainda sendo processados pela Judit.`);
        utils.admin.processoDetalhe.invalidate({ cnj });
      } else if (result.status === "done" && result.baixados > 0) {
        toast.success(`${result.baixados} documento${result.baixados !== 1 ? "s" : ""} baixado${result.baixados !== 1 ? "s" : ""} com sucesso!`);
        utils.admin.processoDetalhe.invalidate({ cnj });
      } else if (result.status === "done" && (result.pendentes ?? 0) > 0) {
        toast.warning(`${result.pendentes} documento${(result.pendentes ?? 0) !== 1 ? "s" : ""} identificado${(result.pendentes ?? 0) !== 1 ? "s" : ""}. Aguardando processamento pela Judit — os arquivos ficarão disponíveis quando o status mudar para 'done'.`);
        utils.admin.processoDetalhe.invalidate({ cnj });
      } else if (result.status === "done" && result.erros > 0) {
        toast.warning(`Documentos identificados mas download não disponível para este tribunal ainda (${result.erros} erro${result.erros !== 1 ? "s" : ""}).`);
        utils.admin.processoDetalhe.invalidate({ cnj });
      } else if (result.status === "no_attachments" || result.status === "no_valid_attachments") {
        toast.warning("Nenhum documento encontrado para este processo na Judit.");
      } else {
        toast.warning("Autos recebidos sem documentos disponíveis no momento.");
      }
    },
    onError: () => {
      // Ignorar erros individuais de polling — tentar novamente
    },
  });

  // Polling: a cada 30s, verificar se o resultado chegou
  useEffect(() => {
    if (!pollingRequestId || pollingTentativa === 0) return;
    if (pollingTentativa > MAX_TENTATIVAS) {
      setPollingRequestId(null);
      setPollingTentativa(0);
      toast.error("Tempo esgotado — a Judit não processou em 10 minutos. Tente novamente mais tarde.");
      return;
    }
    const processoId = (data as any)?.id;
    if (!processoId) return;
    // Primeira tentativa: imediata; demais: aguardar 30s
    if (pollingTentativa === 1) {
      verificarResultadoMutation.mutate({ requestId: pollingRequestId, processoId });
      return;
    }
    const timer = setTimeout(() => {
      verificarResultadoMutation.mutate({ requestId: pollingRequestId, processoId });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [pollingRequestId, pollingTentativa]);

  // Avançar tentativa após cada verificação (quando ainda processing)
  useEffect(() => {
    if (verificarResultadoMutation.data?.status === "processing" && pollingRequestId) {
      setPollingTentativa((t) => t + 1);
    }
  }, [verificarResultadoMutation.data]);

  const { data, isLoading, error } = trpc.admin.processoDetalhe.useQuery(
    { cnj },
    { enabled: !!cnj }
  );

  if (isLoading) {
    return (
      <div className="container max-w-5xl py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container max-w-5xl py-8">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="mb-4 gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar ao Admin
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <p className="text-lg font-medium">Processo não encontrado</p>
          <p className="text-sm text-muted-foreground">CNJ: {cnj}</p>
        </div>
      </div>
    );
  }

  const payload: JuditPayload = data.rawPayload
    ? (typeof data.rawPayload === "string" ? JSON.parse(data.rawPayload) : (data.rawPayload as unknown as JuditPayload))
    : {};
  const requisicoes = (data as any).requisicoes ?? [];

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </Link>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Detalhes do Processo</h1>
        </div>
      </div>

      {/* CNJ + Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Número CNJ</p>
              <p className="text-xl font-mono font-bold text-foreground">{data.cnj}</p>
              {payload.name && (
                <p className="text-sm text-muted-foreground mt-1">{payload.name}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-start">
              <StatusBadge status={data.statusResumido ?? "em_analise_inicial"} />
              {payload.tribunal_acronym && (
                <Badge variant="outline" className="font-mono">
                  {payload.tribunal_acronym}
                </Badge>
              )}
              {payload.instance && (
                <Badge variant="outline">
                  {payload.instance}ª Instância
                </Badge>
              )}
              {payload.secrecy_level != null && payload.secrecy_level > 0 && (
                <Badge variant="destructive">Segredo de Justiça</Badge>
              )}
              {/* Botão de download individual — aparece quando autos não disponíveis */}
              {!(data as any).autosDisponiveis && (
                <div className="flex items-center gap-2">
                  {pollingRequestId ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span className="text-xs">Aguardando Judit... tentativa {pollingTentativa}/{MAX_TENTATIVAS}</span>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      disabled={iniciarDownloadMutation.isPending}
                      onClick={() => iniciarDownloadMutation.mutate({ processoId: (data as any).id })}
                    >
                      {iniciarDownloadMutation.isPending ? (
                        <><Loader2 className="w-3 h-3 animate-spin" />Solicitando...</>
                      ) : (
                        <><FileDown className="w-3 h-3" />Baixar autos deste processo</>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dados Gerais */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Dados Gerais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
            <InfoRow label="Tribunal" value={
              payload.tribunal_acronym
                ? `${payload.tribunal_acronym} (${payload.tribunal})`
                : payload.tribunal
            } />
            <InfoRow label="Justiça" value={payload.justice_description ?? (payload.justice ? `Código ${payload.justice}` : undefined)} />
            <InfoRow label="Área" value={payload.area} />
            <InfoRow label="Fase" value={payload.phase} />
            <InfoRow label="Situação" value={payload.situation ?? payload.status} />
            <InfoRow label="Instância" value={payload.instance ? `${payload.instance}ª Instância` : undefined} />
            <InfoRow label="Vara / Órgão" value={payload.county ?? payload.courts?.[0]?.name} />
            <InfoRow label="Cidade / Estado" value={
              payload.city && payload.state
                ? `${payload.city} – ${payload.state}`
                : payload.city ?? payload.state
            } />
            <InfoRow label="Valor da Causa" value={formatCurrency(payload.amount)} />
            <InfoRow label="Distribuição" value={formatDate(payload.distribution_date)} />
            <InfoRow label="Justiça Gratuita" value={payload.free_justice != null ? (payload.free_justice ? "Sim" : "Não") : undefined} />
            <InfoRow label="Última atualização (Judit)" value={formatDateTime(payload.crawler?.updated_at ?? payload.updated_at)} />
          </div>

          {/* Classificações */}
          {payload.classifications && payload.classifications.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Classe Processual</p>
                {payload.classifications.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{c.name}</span>
                    {c.date && <span className="text-muted-foreground text-xs">({formatDate(c.date)})</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Assuntos */}
      {payload.subjects && payload.subjects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gavel className="w-4 h-4 text-primary" /> Assuntos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {payload.subjects.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {s.name}
                  {s.code && <span className="ml-1 opacity-60">#{s.code}</span>}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Partes */}
      {payload.parties && payload.parties.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Partes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {payload.parties.map((parte, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                    parte.type?.toLowerCase().includes("ativo") || parte.type?.toLowerCase().includes("autor")
                      ? "bg-blue-500"
                      : "bg-orange-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{parte.name ?? "Nome não informado"}</span>
                      {parte.type && (
                        <Badge variant="outline" className="text-xs">{parte.type}</Badge>
                      )}
                    </div>
                    {parte.doc && (
                      <p className="text-xs text-muted-foreground mt-0.5">Doc: {parte.doc}</p>
                    )}
                    {parte.lawyers && parte.lawyers.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {parte.lawyers.map((adv, j) => (
                          <div key={j} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <User className="w-3 h-3 shrink-0" />
                            <span>{adv.name ?? "Advogado"}</span>
                            {adv.oab && <span className="font-mono">OAB: {adv.oab}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {i < (payload.parties?.length ?? 0) - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Última Movimentação (resumo rápido) */}
      {payload.last_step && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Última Movimentação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">{payload.last_step.content ?? "Sem descrição"}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {payload.last_step.step_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateTime(payload.last_step.step_date)}
                      </span>
                    )}
                    {payload.last_step.steps_count != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {payload.last_step.steps_count} movimentações no total
                      </span>
                    )}
                    {payload.last_step.private && (
                      <Badge variant="outline" className="text-xs">Sigiloso</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Documentos (unificado: payload Judit + processo_autos) ─── */}
      {((payload.attachments && payload.attachments.length > 0) || (data as any).autosDisponiveis || (data as any).autosSolicitadoEm) && (
        <DocumentosCard
          attachments={payload.attachments ?? []}
          processoId={(data as any).id}
          autosDisponiveis={(data as any).autosDisponiveis}
          autosJaSolicitados={!!(data as any).autosDisponiveis || !!(data as any).autosSolicitadoEm}
          cnj={cnj}
        />
      )}

      {/* ─── Dados Estruturados da Sentença / Alvará ─── */}
      {(data as any).id && <DadosSentencaCard processoId={(data as any).id} />}

      {/* ─── Histórico Completo de Movimentações ─── */}
      <MovimentacoesTimeline cnj={cnj} />

      {/* Dados do cliente e do sistema */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> Dados no Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cliente */}
          {((data as any).clienteNome || (data as any).clienteCpf) && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 pl-1">
                <InfoRow label="Nome" value={(data as any).clienteNome} />
                <InfoRow
                  label="CPF"
                  value={
                    (data as any).clienteCpf
                      ? (data as any).clienteCpf.replace(
                          /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
                          "$1.$2.$3-$4"
                        )
                      : undefined
                  }
                />
              </div>
              <Separator />
            </>
          )}
          {/* Sistema */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
            <InfoRow label="Advogado" value={data.advogado} />
            <InfoRow label="Fonte de atualização" value={data.fonteAtualizacao} />
            <InfoRow label="Última atualização" value={formatDateTime(data.updatedAt as any)} />
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Requisições Judit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" /> Histórico de Requisições Judit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requisicoes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma requisição registrada para este processo.</p>
          ) : (
            <div className="space-y-3">
              {requisicoes.map((req: any, i: number) => (
                <div key={req.requestId ?? i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg border bg-muted/30">
                  <div className="shrink-0">
                    <RequisicaoStatusBadge status={req.status} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      ID: {req.requestId ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Criada em {formatDateTime(req.createdAt)} · Atualizada em {formatDateTime(req.updatedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Valor Obtido */}
      <ValorObtidoCard cnj={cnj} valorInicial={(data as any).valorObtido} valorUpdatedAt={(data as any).valorObtidoUpdatedAt} />

      {/* Análise IA da Judit */}
      <AnaliseIACard cnj={cnj} aiSummaryInicial={(data as any).aiSummary} aiSummaryUpdatedAt={(data as any).aiSummaryUpdatedAt} />

      {/* AutosProcessuaisCard removido — unificado em DocumentosCard */}
      {/* Payload bruto (expansível) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-primary" /> Payload Bruto (JSON)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
              Clique para expandir o JSON completo retornado pela Judit
            </summary>
            <pre className="mt-3 p-4 rounded-lg bg-muted text-xs overflow-auto max-h-96 font-mono leading-relaxed">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
