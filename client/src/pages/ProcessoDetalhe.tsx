import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Componente de Documentos ─────────────────────────────────────────────────
function DocumentosCard({ attachments }: { attachments: JuditAttachment[] }) {
  const [expandido, setExpandido] = useState(true);
  const [filtro, setFiltro] = useState<string>("todos");

  if (!attachments || attachments.length === 0) return null;

  // Ordenar: mais recentes primeiro
  const ordenados = [...attachments].sort((a, b) => {
    const da = a.attachment_date ? new Date(a.attachment_date).getTime() : 0;
    const db = b.attachment_date ? new Date(b.attachment_date).getTime() : 0;
    return db - da;
  });

  // Filtrar por tipo
  const PRIORIDADE = ["sentenca", "alvara", "decisao", "mandado", "acordao"];
  const filtrados = filtro === "todos"
    ? ordenados
    : filtro === "relevantes"
    ? ordenados.filter(a => PRIORIDADE.includes(categorizarDocumento(a).tipo))
    : ordenados.filter(a => categorizarDocumento(a).tipo === filtro);

  const relevantes = ordenados.filter(a => PRIORIDADE.includes(categorizarDocumento(a).tipo));

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-500" />
            Documentos
            <Badge variant="secondary" className="text-xs">
              {attachments.length} {attachments.length === 1 ? "documento" : "documentos"}
            </Badge>
            {relevantes.length > 0 && (
              <Badge className="text-xs bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100">
                {relevantes.length} relevante{relevantes.length > 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandido((v) => !v)}
            className="h-7 w-7 p-0"
          >
            {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {expandido && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[
              { key: "todos", label: `Todos (${attachments.length})` },
              { key: "relevantes", label: `Relevantes (${relevantes.length})` },
              { key: "sentenca", label: "Sentença" },
              { key: "alvara", label: "Alvará" },
              { key: "decisao", label: "Decisão" },
              { key: "mandado", label: "Mandado" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFiltro(key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filtro === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      {expandido && (
        <CardContent>
          {filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum documento encontrado para este filtro.
            </p>
          ) : (
            <div className="space-y-2">
              {filtrados.map((att, i) => {
                const cat = categorizarDocumento(att);
                const nome = att.attachment_name ?? att.content ?? "Documento sem nome";
                const ext = nome.split(".").pop()?.toLowerCase();
                const isPdf = ext === "pdf";
                const isHtml = ext === "html" || ext === "htm";

                return (
                  <div
                    key={att.attachment_id ?? i}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    {/* Ícone e badge de tipo */}
                    <div className={`shrink-0 mt-0.5 p-1.5 rounded-md border ${cat.cor}`}>
                      <DocIcon tipo={cat.tipo} />
                    </div>

                    {/* Informações */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-sm font-medium text-foreground truncate max-w-xs">
                          {nome}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cat.cor}`}>
                          {cat.label}
                        </span>
                        {att.status === "pending" && (
                          <span className="text-xs px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                            Pendente
                          </span>
                        )}
                        {att.status === "done" && (
                          <span className="text-xs px-1.5 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">
                            Disponível
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {att.attachment_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDateTime(att.attachment_date)}
                          </span>
                        )}
                        {att.attachment_id && (
                          <span className="font-mono opacity-60">ID: {att.attachment_id}</span>
                        )}
                        {(isPdf || isHtml) && (
                          <span className="uppercase font-mono opacity-60">{ext}</span>
                        )}
                      </div>
                    </div>

                    {/* Botão de ação */}
                    <div className="shrink-0">
                      {att.status === "done" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          title="Download disponível"
                        >
                          <Download className="w-3 h-3" />
                          Baixar
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Solicitar via Judit
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Aviso sobre download */}
          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>Sobre os documentos:</strong> Os documentos listados são os attachments indexados pela Judit.
              Documentos com status <strong>"Pendente"</strong> ainda não foram baixados pelo sistema de captura.
              Para obter o arquivo, é necessário solicitar o download via API da Judit (funcionalidade a ser habilitada).
            </p>
          </div>
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

      {/* ─── Documentos (Sentença, Alvará, Decisão etc.) ─── */}
      {payload.attachments && payload.attachments.length > 0 && (
        <DocumentosCard attachments={payload.attachments} />
      )}

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
