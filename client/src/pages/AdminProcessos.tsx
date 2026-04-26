import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Edit2,
  FileText,
  CheckCircle2,
  Filter,
  X,
  CalendarRange,
  SlidersHorizontal,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Eye,
  ExternalLink,
  ListChecks,
  CheckSquare,
  Building2,
  MapPin,
  Scale,
  Calendar,
  DollarSign,
  Users,
  Activity,
  Gavel,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Paperclip,
  Download,
  FileDown,
} from "lucide-react";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface ProcessoRow {
  cnj: string;
  statusResumido: string;
  statusOriginal: string | null;
  advogado: string | null;
  advogadoId: number | null;
  advogadoNome: string | null;
  updatedAt: Date | string;
  clienteNome: string | null;
  clienteCpf: string | null;
  parceiroNome: string | null;
}

interface Filtros {
  status: string[];
  dataInicio: string;
  dataFim: string;
  busca: string;
  investidorId: string; // "" = todos, "_sem" = sem investidor, "123" = id específico
  advogadoId: string;   // "" = todos, "_sem" = sem advogado, "123" = id específico
}

const FILTROS_VAZIOS: Filtros = { status: [], dataInicio: "", dataFim: "", busca: "", investidorId: "", advogadoId: "" };

const STATUS_OPTIONS = Object.entries(STATUS_RESUMIDO_LABELS);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const label = STATUS_RESUMIDO_LABELS[status] ?? status;
  const cor = STATUS_CORES[status] ?? "bg-gray-100 text-gray-800";
  return <Badge className={`${cor} border-0 text-xs whitespace-nowrap`}>{label}</Badge>;
}

function formatarData(data: Date | string | null | undefined): string {
  if (!data) return "—";
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarDataCurta(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Componente de Multi-Select de Status ────────────────────────────────────
function StatusMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(s: string) {
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-[160px] justify-between text-xs font-normal border-border"
        >
          <span className="flex items-center gap-1.5 truncate">
            <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {value.length === 0
              ? "Todos os status"
              : value.length === 1
              ? STATUS_RESUMIDO_LABELS[value[0]!] ?? value[0]
              : `${value.length} status selecionados`}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Filtrar por status</p>
          {value.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-foreground px-1"
              onClick={() => onChange([])}
            >
              Limpar
            </Button>
          )}
        </div>
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {STATUS_OPTIONS.map(([key, label]) => {
            const selecionado = value.includes(key);
            const cor = STATUS_CORES[key] ?? "bg-gray-100 text-gray-800";
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs text-left transition-colors ${
                  selecionado
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/50 text-foreground"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    selecionado
                      ? "border-primary bg-primary"
                      : "border-border bg-background"
                  }`}
                >
                  {selecionado && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <Badge className={`${cor} border-0 text-[10px] py-0 px-1.5`}>{label}</Badge>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Tipos de ordenação ──────────────────────────────────────────────────────
type OrderByColuna = "cnj" | "statusResumido" | "clienteNome" | "parceiroNome" | "updatedAt";
type OrderDir = "asc" | "desc";

// ─── Componente de cabeçalho ordenável ───────────────────────────────────────
function SortableHead({
  coluna,
  label,
  ordenacao,
  onSort,
  className,
}: {
  coluna: OrderByColuna;
  label: string;
  ordenacao: { col: OrderByColuna; dir: OrderDir };
  onSort: (col: OrderByColuna) => void;
  className?: string;
}) {
  const ativo = ordenacao.col === coluna;
  return (
    <TableHead
      className={`text-xs font-semibold cursor-pointer select-none group hover:bg-muted/50 transition-colors ${className ?? ""}`}
      onClick={() => onSort(coluna)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span className={`transition-opacity ${ativo ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}>
          {ativo ? (
            ordenacao.dir === "asc" ? (
              <ArrowUp className="w-3 h-3 text-primary" />
            ) : (
              <ArrowDown className="w-3 h-3 text-primary" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
          )}
        </span>
      </div>
    </TableHead>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function AdminProcessos({ filtroStatusInicial, filtroInvestidorIdInicial }: { filtroStatusInicial?: string; filtroInvestidorIdInicial?: number } = {}) {
  const [, setLocation] = useLocation();
  const [pagina, setPagina] = useState(1);
  const filtrosIniciais: Filtros = filtroStatusInicial
    ? { ...FILTROS_VAZIOS, status: [filtroStatusInicial] }
    : filtroInvestidorIdInicial
    ? { ...FILTROS_VAZIOS, investidorId: String(filtroInvestidorIdInicial) }
    : FILTROS_VAZIOS;
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [filtrosAplicados, setFiltrosAplicados] = useState<Filtros>(filtrosIniciais);
  // Busca com debounce
  const [buscaImediata, setBuscaImediata] = useState(filtrosIniciais.busca);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [editando, setEditando] = useState<ProcessoRow | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
  const [detalheCnj, setDetalheCnj] = useState<string | null>(null);
  // Seleção em massa
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [statusLote, setStatusLote] = useState("");
  const [investidorLote, setInvestidorLote] = useState("");
  // Dialog de percentual
  const [dialogPercentual, setDialogPercentual] = useState(false);
  const [percentualVinculacao, setPercentualVinculacao] = useState<number>(10);
  // Listas dinâmicas de advogados e investidores da tabela users
  const { data: investidoresUsuariosData } = trpc.admin.listarInvestidoresUsuarios.useQuery();
  const investidoresUsuarios = investidoresUsuariosData ?? [];
  const { data: advogadosUsuariosData } = trpc.admin.listarAdvogadosUsuarios.useQuery();
  const advogadosUsuarios = advogadosUsuariosData ?? [];
  const [ordenacao, setOrdenacao] = useState<{ col: OrderByColuna; dir: OrderDir }>({
    col: "updatedAt",
    dir: "desc",
  });

  // Debounce: atualizar busca nos filtros aplicados 400ms após o usuário parar de digitar
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFiltrosAplicados((prev) => ({ ...prev, busca: buscaImediata }));
      setPagina(1);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [buscaImediata]);

  function handleSort(col: OrderByColuna) {
    setOrdenacao((prev) => ({
      col,
      dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc",
    }));
    setPagina(1);
  }

  // Contar filtros ativos
  const filtrosAtivos = [
    filtrosAplicados.status.length > 0,
    !!filtrosAplicados.dataInicio,
    !!filtrosAplicados.dataFim,
    !!filtrosAplicados.busca,
    !!filtrosAplicados.investidorId,
    !!filtrosAplicados.advogadoId,
  ].filter(Boolean).length;

  const vincularInvestidorLoteMutation = trpc.admin.vincularInvestidorEmLote.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.count} processo${res.count !== 1 ? 's' : ''} vinculado${res.count !== 1 ? 's' : ''} ao investidor!`);
      setSelecionados(new Set());
      setInvestidorLote("");
      setDialogPercentual(false);
      setPercentualVinculacao(10);
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const { data, isLoading, refetch } = trpc.admin.processos.useQuery({
    page: pagina,
    status: filtrosAplicados.status.length > 0 ? (filtrosAplicados.status as any) : undefined,
    dataInicio: filtrosAplicados.dataInicio || undefined,
    dataFim: filtrosAplicados.dataFim || undefined,
    busca: filtrosAplicados.busca || undefined,
    orderBy: ordenacao.col,
    orderDir: ordenacao.dir,
    investidorId: filtrosAplicados.investidorId && filtrosAplicados.investidorId !== "_sem"
      ? parseInt(filtrosAplicados.investidorId)
      : undefined,
    semInvestidor: filtrosAplicados.investidorId === "_sem" ? true : undefined,
    advogadoId: filtrosAplicados.advogadoId === "_sem"
      ? null
      : filtrosAplicados.advogadoId
      ? parseInt(filtrosAplicados.advogadoId)
      : undefined,
  });

  const atualizarLoteMutation = trpc.admin.atualizarStatusEmLote.useMutation({
    onSuccess: (res) => {
      toast.success(
        `${res.atualizados} processo${res.atualizados !== 1 ? "s" : ""} atualizado${res.atualizados !== 1 ? "s" : ""} com sucesso!${
          res.erros > 0 ? ` (${res.erros} com erro)` : ""
        }`
      );
      setSelecionados(new Set());
      setStatusLote("");
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const atualizarMutation = trpc.admin.atualizarStatusProcesso.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso!");
      setEditando(null);
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Ação rápida de revisão manual (ganho/perdido)
  const revisaoRapidaMutation = trpc.admin.atualizarStatusProcesso.useMutation({
    onSuccess: (_, vars) => {
      const label = vars.status === "concluido_ganho" ? "Marcado como Ganho" : "Marcado como Perdido";
      toast.success(label);
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Dialog de download de autos
  const [dialogAutos, setDialogAutos] = useState(false);

  const baixarAutosMutation = trpc.admin.baixarAutosProcessos.useMutation({
    onSuccess: (res) => {
      const msgs: string[] = [];
      if (res.iniciados > 0) msgs.push(`${res.iniciados} download${res.iniciados !== 1 ? 's' : ''} iniciado${res.iniciados !== 1 ? 's' : ''}`);
      if (res.jaTemAutos > 0) msgs.push(`${res.jaTemAutos} já tinham autos`);
      if (res.erros > 0) msgs.push(`${res.erros} com erro`);
      toast.success(msgs.join(' · ') || 'Processado');
      setDialogAutos(false);
      setSelecionados(new Set());
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Filtro rápido de revisão manual
  const [modoRevisaoManual, setModoRevisaoManual] = useState(false);

  function toggleRevisaoManual() {
    setModoRevisaoManual((v) => !v);
    if (!modoRevisaoManual) {
      setFiltros((f) => ({ ...f, status: ["arquivado_encerrado"] }));
      setFiltrosAplicados((f) => ({ ...f, status: ["arquivado_encerrado"] }));
    } else {
      setFiltros((f) => ({ ...f, status: [] }));
      setFiltrosAplicados((f) => ({ ...f, status: [] }));
    }
    setPagina(1);
  }

  const processos = (data?.processos ?? []) as ProcessoRow[];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / 50);

  // Helpers de seleção em massa
  const todosSelecionados = processos.length > 0 && processos.every((p) => selecionados.has(p.cnj));
  const algunsSelecionados = processos.some((p) => selecionados.has(p.cnj)) && !todosSelecionados;

  function toggleTodos() {
    if (todosSelecionados) {
      setSelecionados((prev) => {
        const next = new Set(prev);
        processos.forEach((p) => next.delete(p.cnj));
        return next;
      });
    } else {
      setSelecionados((prev) => {
        const next = new Set(prev);
        processos.forEach((p) => next.add(p.cnj));
        return next;
      });
    }
  }

  function toggleProcesso(cnj: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(cnj)) next.delete(cnj); else next.add(cnj);
      return next;
    });
  }

  function aplicarLote() {
    if (!statusLote || selecionados.size === 0) return;
    atualizarLoteMutation.mutate({ cnjs: Array.from(selecionados), status: statusLote as any });
  }
  function aplicarInvestidorLote() {
    if (!investidorLote || selecionados.size === 0) return;
    setDialogPercentual(true);
  }

  function confirmarVinculacaoComPercentual() {
    if (!investidorLote || selecionados.size === 0) return;
    if (percentualVinculacao < 1 || percentualVinculacao > 49) {
      toast.error("O percentual deve ser entre 1% e 49%");
      return;
    }
    vincularInvestidorLoteMutation.mutate({
      cnjs: Array.from(selecionados),
      investidorId: parseInt(investidorLote),
      percentual: percentualVinculacao,
    });
  }

  const aplicarFiltros = useCallback(() => {
    setPagina(1);
    setFiltrosAplicados({ ...filtros, busca: buscaImediata });
    setFiltroAberto(false);
  }, [filtros, buscaImediata]);

  const limparFiltros = useCallback(() => {
    setFiltros(FILTROS_VAZIOS);
    setFiltrosAplicados(FILTROS_VAZIOS);
    setBuscaImediata("");
    setPagina(1);
    setFiltroAberto(false);
  }, []);

  function removerFiltro(campo: keyof Filtros) {
    const novos = { ...filtrosAplicados };
    if (campo === "status") novos.status = [];
    else novos[campo] = "";
    if (campo === "busca") setBuscaImediata("");
    setFiltros(novos);
    setFiltrosAplicados(novos);
    setPagina(1);
  }

  function abrirEdicao(p: ProcessoRow) {
    setEditando(p);
    setNovoStatus(p.statusResumido);
  }

  function abrirDetalhes(cnj: string) {
    setDetalheCnj(cnj);
  }

  function irParaDetalhe(cnj: string) {
    window.open(`/admin/processo/${encodeURIComponent(cnj)}`, '_blank', 'noopener,noreferrer');
  }

  function salvarStatus() {
    if (!editando || !novoStatus) return;
    atualizarMutation.mutate({ cnj: editando.cnj, status: novoStatus as any });
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {modoRevisaoManual ? "Revisão manual necessária" : "Todos os processos"}
              <Badge variant="outline" className="ml-1 text-xs">{total}</Badge>
            </CardTitle>

            <div className="flex items-center gap-2">
              {/* Botão filtro rápido: Revisão Manual */}
              <Button
                variant={modoRevisaoManual ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs ${modoRevisaoManual ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : ""}`}
                onClick={toggleRevisaoManual}
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                Revisão manual
                {modoRevisaoManual && <X className="w-3 h-3 ml-1.5" />}
              </Button>

              {/* Botão de filtro avançado */}
            <Button
              variant={filtrosAtivos > 0 ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFiltroAberto((v) => !v)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
              Filtros
              {filtrosAtivos > 0 && (
                <Badge className="ml-1.5 bg-white/20 text-white border-0 text-[10px] px-1.5 py-0">
                  {filtrosAtivos}
                </Badge>
              )}
            </Button>
            </div>
          </div>

          {/* Painel de filtros */}
          {filtroAberto && (
            <div className="mt-3 p-4 bg-muted/30 rounded-lg border border-border/60 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                  Filtros avançados
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setFiltroAberto(false)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Busca textual com debounce */}
                <div className="space-y-1.5 lg:col-span-1">
                  <label className="text-xs font-medium text-muted-foreground">Busca</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="CNJ, nome, CPF..."
                      value={buscaImediata}
                      onChange={(e) => setBuscaImediata(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Multi-select de status */}
                <div className="space-y-1.5 lg:col-span-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <StatusMultiSelect
                    value={filtros.status}
                    onChange={(v) => setFiltros((f) => ({ ...f, status: v }))}
                  />
                </div>

                {/* Data início */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <CalendarRange className="w-3 h-3" />
                    Atualizado após
                  </label>
                  <Input
                    type="date"
                    value={filtros.dataInicio}
                    onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Data fim */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <CalendarRange className="w-3 h-3" />
                    Atualizado até
                  </label>
                  <Input
                    type="date"
                    value={filtros.dataFim}
                    onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Filtro por advogado - Select dinâmico */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Advogado
                  </label>
                  <Select
                    value={filtros.advogadoId || "_todos"}
                    onValueChange={(v) => setFiltros((f) => ({ ...f, advogadoId: v === "_todos" ? "" : v }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todos os advogados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_todos" className="text-xs">Todos os advogados</SelectItem>
                      <SelectItem value="_sem" className="text-xs text-muted-foreground">Sem advogado vinculado</SelectItem>
                      {(advogadosUsuarios as any[]).map((adv) => (
                        <SelectItem key={adv.id} value={String(adv.id)} className="text-xs">{adv.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filtro por investidor - Select dinâmico */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Investidor
                  </label>
                  <Select
                    value={filtros.investidorId || "_todos"}
                    onValueChange={(v) => setFiltros((f) => ({ ...f, investidorId: v === "_todos" ? "" : v }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todos os investidores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_todos" className="text-xs">Todos os investidores</SelectItem>
                      <SelectItem value="_sem" className="text-xs text-muted-foreground">Sem investidor vinculado</SelectItem>
                      {(investidoresUsuarios as any[]).map((inv) => (
                        <SelectItem key={inv.id} value={String(inv.id)} className="text-xs">{inv.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="h-8 text-xs" onClick={aplicarFiltros}>
                  <Filter className="w-3.5 h-3.5 mr-1.5" />
                  Aplicar filtros
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={limparFiltros}
                >
                  Limpar tudo
                </Button>
              </div>
            </div>
          )}

          {/* Badges de filtros ativos */}
          {filtrosAtivos > 0 && !filtroAberto && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtros ativos:</span>
              {filtrosAplicados.busca && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  Busca: "{filtrosAplicados.busca}"
                  <button onClick={() => removerFiltro("busca")} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.status.length > 0 && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  {filtrosAplicados.status.length === 1
                    ? STATUS_RESUMIDO_LABELS[filtrosAplicados.status[0]!]
                    : `${filtrosAplicados.status.length} status`}
                  <button onClick={() => removerFiltro("status")} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.dataInicio && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  A partir de {formatarDataCurta(filtrosAplicados.dataInicio)}
                  <button onClick={() => removerFiltro("dataInicio")} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.dataFim && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  Até {formatarDataCurta(filtrosAplicados.dataFim)}
                  <button onClick={() => removerFiltro("dataFim")} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.advogadoId && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  Advogado: {filtrosAplicados.advogadoId === "_sem"
                    ? "Sem advogado"
                    : (advogadosUsuarios as any[]).find((a) => String(a.id) === filtrosAplicados.advogadoId)?.name ?? filtrosAplicados.advogadoId}
                  <button onClick={() => removerFiltro("advogadoId")} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.investidorId && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  Investidor: {filtrosAplicados.investidorId === "_sem"
                    ? "Sem investidor"
                    : (investidoresUsuarios as any[]).find((i) => String(i.id) === filtrosAplicados.investidorId)?.name ?? filtrosAplicados.investidorId}
                  <button onClick={() => removerFiltro("investidorId")} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              <button
                onClick={limparFiltros}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Limpar todos
              </button>
            </div>
          )}
        </CardHeader>

        <Separator />

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : processos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">
                {filtrosAtivos > 0
                  ? "Nenhum processo encontrado para os filtros aplicados."
                  : "Nenhum processo cadastrado."}
              </p>
              {filtrosAtivos > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 text-xs"
                  onClick={limparFiltros}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Barra de ações em massa */}
              {selecionados.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-primary/20 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>
                      {selecionados.size} processo{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <Select value={statusLote} onValueChange={setStatusLote}>
                      <SelectTrigger className="h-7 text-xs w-52">
                        <SelectValue placeholder="Selecionar novo status..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(([value, label]) => (
                          <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!statusLote || atualizarLoteMutation.isPending}
                      onClick={aplicarLote}
                    >
                      {atualizarLoteMutation.isPending ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Aplicando...
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <ListChecks className="w-3.5 h-3.5" />
                          Aplicar a {selecionados.size}
                        </span>
                      )}
                    </Button>
                    {/* Ação: vincular investidor em lote */}
                    {investidoresUsuarios.length > 0 && (
                      <>
                        <Select value={investidorLote} onValueChange={setInvestidorLote}>
                          <SelectTrigger className="h-7 text-xs w-44">
                            <SelectValue placeholder="Vincular investidor..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(investidoresUsuarios as any[]).map((inv) => (
                              <SelectItem key={inv.id} value={String(inv.id)} className="text-xs">{inv.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-background"
                          disabled={!investidorLote || vincularInvestidorLoteMutation.isPending}
                          onClick={aplicarInvestidorLote}
                        >
                          {vincularInvestidorLoteMutation.isPending ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              Vinculando...
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              Vincular
                            </span>
                          )}
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-background border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => setDialogAutos(true)}
                    >
                      <FileDown className="w-3.5 h-3.5 mr-1" />
                      Baixar autos ({selecionados.size})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => { setSelecionados(new Set()); setStatusLote(""); setInvestidorLote(""); setDialogPercentual(false); }}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        checked={todosSelecionados}
                        ref={(el) => {
                          if (el) (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = algunsSelecionados;
                        }}
                        onCheckedChange={toggleTodos}
                        aria-label="Selecionar todos na página"
                      />
                    </TableHead>
                    <SortableHead coluna="cnj" label="CNJ" ordenacao={ordenacao} onSort={handleSort} />
                    <SortableHead coluna="clienteNome" label="Cliente" ordenacao={ordenacao} onSort={handleSort} />
                    <TableHead className="text-xs font-semibold">Advogado</TableHead>
                    <SortableHead coluna="statusResumido" label="Status" ordenacao={ordenacao} onSort={handleSort} />
                    <SortableHead coluna="updatedAt" label="Atualizado" ordenacao={ordenacao} onSort={handleSort} />
                    <TableHead className="text-xs font-semibold w-16">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processos.map((p) => (
                    <TableRow
                      key={p.cnj}
                      className={`hover:bg-muted/20 transition-colors cursor-pointer ${selecionados.has(p.cnj) ? "bg-primary/5" : ""}`}
                      onClick={() => toggleProcesso(p.cnj)}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionados.has(p.cnj)}
                          onCheckedChange={() => toggleProcesso(p.cnj)}
                          aria-label={`Selecionar processo ${p.cnj}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[160px] truncate" onClick={(e) => e.stopPropagation()}>
                        <span className="flex items-center gap-1">
                          {(p as any).autosDisponiveis && (
                            <span title="Autos disponíveis"><Paperclip className="w-3 h-3 text-amber-500 flex-shrink-0" /></span>
                          )}
                          <a
                            href={`/admin/processo/${encodeURIComponent(p.cnj)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-mono text-xs"
                          >
                            {p.cnj}
                          </a>
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          <p className="font-medium text-foreground truncate max-w-[120px]">
                            {p.clienteNome ?? "—"}
                          </p>
                          <p className="text-muted-foreground font-mono">{p.clienteCpf ?? "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {(p as any).advogadoNome ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.statusResumido} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatarData(p.updatedAt)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-0.5">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={`/admin/processo/${encodeURIComponent(p.cnj)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors"
                                  onClick={(e) => {
                                    if (!e.ctrlKey && !e.metaKey) {
                                      e.preventDefault();
                                      abrirDetalhes(p.cnj);
                                    }
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Ver detalhes rápidos (Ctrl+Click abre em nova aba)
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => irParaDetalhe(p.cnj)}
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Abrir em nova aba
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => abrirEdicao(p)}
                            title="Alterar status"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          {/* Ações rápidas para processos em revisão manual */}
                          {p.statusResumido === "arquivado_encerrado" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 hover:text-green-600 hover:bg-green-50"
                                title="Marcar como Ganho"
                                disabled={revisaoRapidaMutation.isPending}
                                onClick={() => revisaoRapidaMutation.mutate({ cnj: p.cnj, status: "concluido_ganho" as any })}
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 hover:text-red-600 hover:bg-red-50"
                                title="Marcar como Perdido"
                                disabled={revisaoRapidaMutation.isPending}
                                onClick={() => revisaoRapidaMutation.mutate({ cnj: p.cnj, status: "concluido_perdido" as any })}
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Página {pagina} de {totalPaginas}
                {filtrosAtivos > 0 && (
                  <span className="ml-1 text-primary font-medium">
                    ({total} resultado{total !== 1 ? "s" : ""})
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                {/* Números de página */}
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                  const pg = pagina <= 3
                    ? i + 1
                    : pagina >= totalPaginas - 2
                    ? totalPaginas - 4 + i
                    : pagina - 2 + i;
                  if (pg < 1 || pg > totalPaginas) return null;
                  return (
                    <Button
                      key={pg}
                      variant={pg === pagina ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setPagina(pg)}
                    >
                      {pg}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de percentual de vinculação de investidor */}
      <Dialog open={dialogPercentual} onOpenChange={(open) => { if (!open) { setDialogPercentual(false); setInvestidorLote(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Vincular investidor com percentual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Informações do investidor selecionado */}
            <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
              <p className="font-medium text-foreground">
                {(investidoresUsuarios as any[]).find((i) => String(i.id) === investidorLote)?.name ?? investidorLote}
              </p>
              <p className="text-muted-foreground">
                {selecionados.size} processo{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Campo de percentual */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Percentual de participação (%)</label>
              <Input
                type="number"
                min={1}
                max={49}
                value={percentualVinculacao}
                onChange={(e) => setPercentualVinculacao(Math.min(49, Math.max(1, Number(e.target.value))))}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                O cliente sempre recebe 51%. O percentual informado será do investidor dentro dos 49% restantes.
              </p>
            </div>
            {/* Validação visual */}
            {(percentualVinculacao < 1 || percentualVinculacao > 49) && (
              <p className="text-xs text-destructive">O percentual deve ser entre 1% e 49%.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDialogPercentual(false); setInvestidorLote(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={confirmarVinculacaoComPercentual}
              disabled={vincularInvestidorLoteMutation.isPending || percentualVinculacao < 1 || percentualVinculacao > 49}
            >
              {vincularInvestidorLoteMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Vinculando...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Confirmar vinculação
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de edição de status */}
      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Alterar status do processo</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <p className="font-mono text-muted-foreground">{editando.cnj}</p>
                <p className="font-medium text-foreground">{editando.clienteNome ?? "—"}</p>
                <div className="pt-1">
                  <StatusBadge status={editando.statusResumido} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Novo status</label>
                <Select value={novoStatus} onValueChange={setNovoStatus}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={salvarStatus}
              disabled={atualizarMutation.isPending || novoStatus === editando?.statusResumido}
            >
              {atualizarMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Salvar
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de detalhes Judit */}
      <DialogDetalhesJudit cnj={detalheCnj} onClose={() => setDetalheCnj(null)} />

      {/* Dialog de download de autos */}
      <Dialog open={dialogAutos} onOpenChange={(open) => !open && setDialogAutos(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <FileDown className="w-4 h-4 text-amber-600" />
              Baixar autos processuais
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2">
              <p className="font-medium text-amber-800">
                {selecionados.size} processo{selecionados.size !== 1 ? 's' : ''} selecionado{selecionados.size !== 1 ? 's' : ''}
              </p>
              <p className="text-amber-700">
                Cada download de autos custa <strong>R$ 3,50</strong> na Judit. O custo estimado desta operação é de <strong>R$ {(selecionados.size * 3.5).toFixed(2).replace('.', ',')}</strong>.
              </p>
              <p className="text-amber-600">
                Os arquivos serão salvos automaticamente e ficarão disponíveis na página de detalhes de cada processo.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Processos que já possuem autos baixados não serão cobrados novamente.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogAutos(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                const processosSelecionadosIds = processos
                  .filter((p) => selecionados.has(p.cnj))
                  .map((p) => (p as any).id)
                  .filter(Boolean);
                baixarAutosMutation.mutate({ processoIds: processosSelecionadosIds });
              }}
              disabled={baixarAutosMutation.isPending}
            >
              {baixarAutosMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Solicitando...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Confirmar download
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Dialog de Detalhes Judit ─────────────────────────────────────────────────
interface JuditPayload {
  status?: string;
  situation?: string;
  phase?: string;
  tribunal?: string;
  tribunal_acronym?: string;
  justice_description?: string;
  instance?: string | number;
  area?: string;
  amount?: string | number;
  city?: string;
  state?: string;
  distribution_date?: string;
  last_step?: { content?: string; step_date?: string };
  subjects?: Array<{ name?: string; code?: string }>;
  parties?: Array<{ name?: string; type?: string; doc?: string; lawyers?: Array<{ name?: string; oab?: string }> }>;
  steps?: Array<{ content?: string; step_date?: string; step_type?: string }>;
  judge?: string;
  free_justice?: boolean;
}

function DialogDetalhesJudit({ cnj, onClose }: { cnj: string | null; onClose: () => void }) {
  const { data: processo, isLoading } = trpc.admin.processoDetalhe.useQuery(
    { cnj: cnj! },
    { enabled: !!cnj }
  );

  const payload = processo?.rawPayload as JuditPayload | null | undefined;

  function fmt(val: string | null | undefined) {
    return val && val !== "null" ? val : "—";
  }

  function fmtData(iso: string | null | undefined) {
    if (!iso || iso === "null") return "—";
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function fmtValor(v: string | number | null | undefined) {
    if (!v || v === "null") return "—";
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n)) return String(v);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  return (
    <Dialog open={!!cnj} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" />
            Detalhes do Processo — Judit
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : !payload ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum dado Judit disponível para este processo.</p>
            <p className="text-xs mt-1">Use a aba Judit para disparar a atualização.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* CNJ e Status */}
            <div className="p-3 bg-muted/40 rounded-lg">
              <p className="text-xs font-mono text-muted-foreground mb-1">{cnj}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <StatusBadge status={processo?.statusResumido ?? "em_analise_inicial"} />
                {payload.phase && (
                  <Badge variant="outline" className="text-xs">{payload.phase}</Badge>
                )}
              </div>
            </div>

            {/* Informações do Tribunal */}
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                Tribunal
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Tribunal</p>
                  <p className="font-medium">{fmt(payload.tribunal_acronym)}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Justiça</p>
                  <p className="font-medium">{fmt(payload.justice_description)}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Instância</p>
                  <p className="font-medium">{payload.instance ? `${payload.instance}ª Instância` : "—"}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Área</p>
                  <p className="font-medium">{fmt(payload.area)}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Localidade</p>
                  <p className="font-medium">
                    {payload.city && payload.state ? `${payload.city} / ${payload.state}` : "—"}
                  </p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Distribuição</p>
                  <p className="font-medium">{fmtData(payload.distribution_date)}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Valor da Causa</p>
                  <p className="font-medium text-emerald-600">{fmtValor(payload.amount)}</p>
                </div>
                {payload.judge && (
                  <div className="bg-muted/30 rounded p-2">
                    <p className="text-muted-foreground">Juiz</p>
                    <p className="font-medium">{payload.judge}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Assuntos */}
            {payload.subjects && payload.subjects.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Gavel className="w-3.5 h-3.5 text-primary" />
                  Assuntos
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {payload.subjects.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{s.name}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Partes */}
            {payload.parties && payload.parties.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  Partes ({payload.parties.length})
                </h4>
                <div className="space-y-1.5">
                  {payload.parties.map((p, i) => (
                    <div key={i} className="bg-muted/30 rounded p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{p.name ?? "—"}</span>
                        <Badge variant="outline" className="text-[10px] h-4">{p.type ?? "—"}</Badge>
                      </div>
                      {p.doc && <p className="text-muted-foreground font-mono mt-0.5">{p.doc}</p>}
                      {p.lawyers && p.lawyers.length > 0 && (
                        <p className="text-muted-foreground mt-0.5">
                          Adv: {p.lawyers.map(l => `${l.name}${l.oab ? ` (OAB ${l.oab})` : ""}`).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Última Movimentação */}
            {payload.last_step && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  Última Movimentação
                </h4>
                <div className="bg-muted/30 rounded p-2 text-xs">
                  <p className="text-muted-foreground mb-0.5">{fmtData(payload.last_step.step_date)}</p>
                  <p className="font-medium">{payload.last_step.content ?? "—"}</p>
                </div>
              </div>
            )}

            {/* Movimentações recentes */}
            {payload.steps && payload.steps.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Movimentações ({payload.steps.length})
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {[...payload.steps]
                    .sort((a, b) => new Date(b.step_date ?? 0).getTime() - new Date(a.step_date ?? 0).getTime())
                    .slice(0, 20)
                    .map((s, i) => (
                      <div key={i} className="flex gap-2 text-xs border-l-2 border-primary/20 pl-2 py-0.5">
                        <span className="text-muted-foreground whitespace-nowrap shrink-0">{fmtData(s.step_date)}</span>
                        <span className="text-foreground">{s.content ?? "—"}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
