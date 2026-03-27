import { useState } from "react";
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
} from "lucide-react";
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

  const payload: JuditPayload = data.rawPayload ? JSON.parse(data.rawPayload as string) : {};
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

      {/* ─── Histórico Completo de Movimentações ─── */}
      <MovimentacoesTimeline cnj={cnj} />

      {/* Dados do escritório / advogado no sistema */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> Dados no Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
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
