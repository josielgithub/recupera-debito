import { useState, useCallback } from "react";
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
} from "lucide-react";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";
import { toast } from "sonner";

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface ProcessoRow {
  cnj: string;
  statusResumido: string;
  statusOriginal: string | null;
  advogado: string | null;
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
}

const FILTROS_VAZIOS: Filtros = { status: [], dataInicio: "", dataFim: "", busca: "" };

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
export default function AdminProcessos() {
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState<Filtros>(FILTROS_VAZIOS);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [editando, setEditando] = useState<ProcessoRow | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
  const [ordenacao, setOrdenacao] = useState<{ col: OrderByColuna; dir: OrderDir }>({
    col: "updatedAt",
    dir: "desc",
  });

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
  ].filter(Boolean).length;

  const { data, isLoading, refetch } = trpc.admin.processos.useQuery({
    page: pagina,
    status: filtrosAplicados.status.length > 0 ? (filtrosAplicados.status as any) : undefined,
    dataInicio: filtrosAplicados.dataInicio || undefined,
    dataFim: filtrosAplicados.dataFim || undefined,
    busca: filtrosAplicados.busca || undefined,
    orderBy: ordenacao.col,
    orderDir: ordenacao.dir,
  });

  const atualizarMutation = trpc.admin.atualizarStatusProcesso.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso!");
      setEditando(null);
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const processos = (data?.processos ?? []) as ProcessoRow[];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / 50);

  const aplicarFiltros = useCallback(() => {
    setPagina(1);
    setFiltrosAplicados({ ...filtros });
    setFiltroAberto(false);
  }, [filtros]);

  const limparFiltros = useCallback(() => {
    setFiltros(FILTROS_VAZIOS);
    setFiltrosAplicados(FILTROS_VAZIOS);
    setPagina(1);
    setFiltroAberto(false);
  }, []);

  function removerFiltro(campo: keyof Filtros) {
    const novos = { ...filtrosAplicados };
    if (campo === "status") novos.status = [];
    else novos[campo] = "";
    setFiltros(novos);
    setFiltrosAplicados(novos);
    setPagina(1);
  }

  function abrirEdicao(p: ProcessoRow) {
    setEditando(p);
    setNovoStatus(p.statusResumido);
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
              Todos os processos
              <Badge variant="outline" className="ml-1 text-xs">{total}</Badge>
            </CardTitle>

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
                {/* Busca textual */}
                <div className="space-y-1.5 lg:col-span-1">
                  <label className="text-xs font-medium text-muted-foreground">Busca</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="CNJ, nome, CPF..."
                      value={filtros.busca}
                      onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <SortableHead coluna="cnj" label="CNJ" ordenacao={ordenacao} onSort={handleSort} />
                    <SortableHead coluna="clienteNome" label="Cliente" ordenacao={ordenacao} onSort={handleSort} />
                    <SortableHead coluna="parceiroNome" label="Escritório" ordenacao={ordenacao} onSort={handleSort} />
                    <SortableHead coluna="statusResumido" label="Status" ordenacao={ordenacao} onSort={handleSort} />
                    <SortableHead coluna="updatedAt" label="Atualizado" ordenacao={ordenacao} onSort={handleSort} />
                    <TableHead className="text-xs font-semibold w-16">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processos.map((p) => (
                    <TableRow key={p.cnj} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[160px] truncate">
                        {p.cnj}
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
                        {p.parceiroNome ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.statusResumido} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatarData(p.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => abrirEdicao(p)}
                          title="Alterar status"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
    </div>
  );
}
