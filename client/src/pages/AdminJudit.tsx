import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Search, CheckCircle, Clock, AlertTriangle, DollarSign,
  RefreshCw, ListChecks, History, FileSearch, ChevronLeft, ChevronRight, Download
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCpf(cpf: string | null | undefined) {
  if (!cpf) return "-";
  const c = cpf.replace(/\D/g, "");
  if (c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  return cpf;
}

function formatCnj(cnj: string) {
  if (!cnj) return "-";
  const d = cnj.replace(/\D/g, "");
  if (d.length === 20)
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
  return cnj;
}

// ─── Seção 1: Cards de Métricas ───────────────────────────────────────────────
function SecaoMetricas() {
  const { data, isLoading, refetch } = trpc.admin.metricsJudit.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const creditoRestante = data?.creditoRestante ?? 0;
  const limiteMensal = data?.limiteMensal ?? 1000;
  const pct = limiteMensal > 0 ? (creditoRestante / limiteMensal) * 100 : 0;
  const creditoCor = pct > 20 ? "text-green-600" : pct > 10 ? "text-orange-500" : "text-red-600";

  const cards = [
    {
      icon: <DollarSign className={`h-5 w-5 ${creditoCor}`} />,
      label: "Crédito restante (mês)",
      value: isLoading ? "…" : <span className={creditoCor}>R$ {creditoRestante.toFixed(2)}</span>,
      sub: `de R$ ${limiteMensal.toFixed(2)}`,
    },
    {
      icon: <CheckCircle className="h-5 w-5 text-blue-600" />,
      label: "Consultas este mês",
      value: isLoading ? "…" : String(data?.consultasMes ?? 0),
      sub: `Custo: R$ ${(data?.custoMes ?? 0).toFixed(2)}`,
    },
    {
      icon: <RefreshCw className="h-5 w-5 text-purple-600" />,
      label: "Requisições processando",
      value: isLoading ? "…" : String(data?.requisicaoProcessando ?? 0),
      sub: "em andamento na Judit",
    },
    {
      icon: <Clock className="h-5 w-5 text-yellow-600" />,
      label: "Processos na fila",
      value: isLoading ? "…" : String(data?.processosNaFila ?? 0),
      sub: "aguardando aprovação",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Visão Geral</h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 text-xs">
          <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <Card key={i} className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">{c.icon}<span className="text-xs text-muted-foreground">{c.label}</span></div>
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Seção 2: Fila de Consulta ────────────────────────────────────────────────
function SecaoFila() {
  const [busca, setBusca] = useState("");
  const [advogadoId, setAdvogadoId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);

  const { data: advogados } = trpc.admin.listarAdvogadosUsuarios.useQuery();
  const { data: metrics } = trpc.admin.metricsJudit.useQuery();
  const { data, isLoading, refetch } = trpc.admin.filaJuditFiltrada.useQuery(
    { page, pageSize: 50, busca: busca || undefined, advogadoId },
    { refetchInterval: 30_000 }
  );

  const utils = trpc.useUtils();
  const aprovar = trpc.admin.aprovarFilaJudit.useMutation({
    onSuccess: (res) => {
      const ok = res.resultados.filter(r => r.ok).length;
      const notFound = res.resultados.filter(r => r.ok && (r as { notFound?: boolean }).notFound).length;
      const erro = res.resultados.filter(r => !r.ok).length;
      toast.success(`${ok} consultado(s) — ${ok - notFound} encontrado(s), ${notFound} não encontrado(s)${erro > 0 ? `, ${erro} erro(s)` : ""}`);
      setSelecionados([]);
      setConfirmOpen(false);
      setProgresso(null);
      utils.admin.filaJuditFiltrada.invalidate();
      utils.admin.metricsJudit.invalidate();
      utils.admin.historicoJudit.invalidate();
    },
    onError: (e) => { toast.error(e.message); setProgresso(null); },
  });

  const processos = data?.processos ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);
  const custoEstimado = (selecionados.length * 0.25).toFixed(2);
  const creditoDisponivel = metrics?.creditoRestante ?? 1000;
  const ultrapassaCredito = parseFloat(custoEstimado) > creditoDisponivel;

  const toggleTodos = () => {
    if (selecionados.length === processos.length) setSelecionados([]);
    else setSelecionados(processos.map(p => p.id));
  };

  const handleConfirmar = () => {
    setProgresso({ atual: 0, total: selecionados.length });
    aprovar.mutate({ processoIds: selecionados });
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por CNJ ou nome..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select
          value={advogadoId ? String(advogadoId) : "todos"}
          onValueChange={v => { setAdvogadoId(v === "todos" ? undefined : Number(v)); setPage(1); }}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Filtrar por advogado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os advogados</SelectItem>
            {advogados?.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.name ?? a.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Barra de ações em massa */}
      {selecionados.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {selecionados.length} selecionado(s) — custo estimado: <strong>R$ {custoEstimado}</strong>
          </span>
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={aprovar.isPending}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Consultar na Judit
          </Button>
        </div>
      )}

      {/* Progresso */}
      {progresso && (
        <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm text-center">
          <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
          Consultando {progresso.atual} de {progresso.total}...
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 w-10">
                <Checkbox
                  checked={processos.length > 0 && selecionados.length === processos.length}
                  onCheckedChange={toggleTodos}
                />
              </th>
              <th className="p-3 text-left font-medium">CNJ</th>
              <th className="p-3 text-left font-medium hidden md:table-cell">Cliente</th>
              <th className="p-3 text-left font-medium hidden lg:table-cell">Advogado ID</th>
              <th className="p-3 text-left font-medium hidden md:table-cell">Importado em</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : processos.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <ListChecks className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhum processo na fila{busca ? ` para "${busca}"` : ""}</span>
                </div>
              </td></tr>
            ) : processos.map(p => {
              const sel = selecionados.includes(p.id);
              return (
                <tr key={p.id} className={`border-t hover:bg-muted/30 transition-colors ${sel ? "bg-blue-50/50 dark:bg-blue-950/30" : ""}`}>
                  <td className="p-3">
                    <Checkbox
                      checked={sel}
                      onCheckedChange={checked => {
                        setSelecionados(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id));
                      }}
                    />
                  </td>
                  <td className="p-3 font-mono text-xs">{formatCnj(p.cnj)}</td>
                  <td className="p-3 hidden md:table-cell">{p.clienteNome ?? "-"}</td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">{p.advogadoId ?? "-"}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} processo(s) na fila</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm flex items-center px-2">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar consulta Judit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Processos selecionados</span><strong>{selecionados.length}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Custo por consulta</span><strong>R$ 0,25</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Crédito disponível</span><strong>R$ {creditoDisponivel.toFixed(2)}</strong></div>
              <div className="flex justify-between border-t pt-2 mt-2"><span className="font-medium">Custo total estimado</span><strong className={ultrapassaCredito ? "text-red-600" : "text-green-700"}>R$ {custoEstimado}</strong></div>
            </div>
            {ultrapassaCredito && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                O custo estimado ultrapassa o crédito disponível este mês.
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Esta ação irá disparar consultas na API Judit para os {selecionados.length} processo(s) selecionados. Esta operação não pode ser desfeita.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmar} disabled={aprovar.isPending} variant={ultrapassaCredito ? "destructive" : "default"}>
              {aprovar.isPending ? "Processando..." : `Confirmar (R$ ${custoEstimado})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Seção 3: Busca por CPF ───────────────────────────────────────────────────
function SecaoBuscaCpf() {
  const [cpfInput, setCpfInput] = useState("");
  const [cpfBusca, setCpfBusca] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading } = trpc.admin.buscarProcessosPorCpf.useQuery(
    { cpf: cpfBusca ?? "" },
    { enabled: !!cpfBusca }
  );

  const formatarCpfInput = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };

  const handleBuscar = () => {
    const limpo = cpfInput.replace(/\D/g, "");
    if (limpo.length < 11) { toast.error("CPF inválido"); return; }
    setConfirmOpen(true);
  };

  const handleConfirmar = () => {
    const limpo = cpfInput.replace(/\D/g, "");
    setCpfBusca(limpo);
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Consulta todos os processos vinculados ao CPF diretamente na Judit e salva no banco.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="000.000.000-00"
            value={cpfInput}
            onChange={e => setCpfInput(formatarCpfInput(e.target.value))}
            onKeyDown={e => e.key === "Enter" && handleBuscar()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleBuscar} disabled={isLoading}>
          {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
          Buscar
        </Button>
      </div>

      {cpfBusca && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left font-medium">CNJ</th>
                <th className="p-3 text-left font-medium">Cliente</th>
                <th className="p-3 text-left font-medium hidden md:table-cell">CPF</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="p-3 text-left font-medium hidden lg:table-cell">Status Judit</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Buscando...</td></tr>
              ) : !data || data.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <FileSearch className="h-8 w-8 text-muted-foreground/50" />
                    <span>Nenhum processo encontrado para o CPF informado</span>
                  </div>
                </td></tr>
              ) : data.map(p => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{formatCnj(p.cnj)}</td>
                  <td className="p-3">{p.clienteNome ?? "-"}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{formatCpf(p.clienteCpf)}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">{p.statusResumido ?? "-"}</Badge>
                  </td>
                  <td className="p-3 hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs">{p.statusJudit ?? "-"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar busca por CPF</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Esta consulta pode retornar múltiplos processos. Cada processo encontrado custará <strong>R$ 0,25</strong>.
            </p>
            <div className="bg-muted rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">CPF consultado: </span>
              <strong>{cpfInput}</strong>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmar}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Seção 4: Histórico ───────────────────────────────────────────────────────
function SecaoHistorico() {
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "custom">("30d");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.historicoJudit.useQuery({ periodo, page, pageSize: 50 });

  const registros = data?.registros ?? [];
  const total = data?.total ?? 0;
  const custoTotal = data?.custoTotal ?? 0;
  const totalPages = Math.ceil(total / 50);

  const STATUS_HIST: Record<string, { label: string; color: string }> = {
    sucesso: { label: "Sucesso", color: "bg-green-100 text-green-800" },
    nao_encontrado: { label: "Não encontrado", color: "bg-gray-100 text-gray-700" },
    erro: { label: "Erro", color: "bg-red-100 text-red-800" },
  };

  const exportarCsv = () => {
    if (!registros.length) return;
    const header = ["CNJ", "Tipo", "Custo", "Status", "Data"];
    const rows = registros.map(r => [
      r.processoCnj,
      r.tipo ?? "",
      Number(r.custo).toFixed(2),
      r.status,
      new Date(r.createdAt).toLocaleString("pt-BR"),
    ]);
    const csv = [header, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-judit-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["7d", "30d"] as const).map(p => (
            <Button
              key={p}
              variant={periodo === p ? "default" : "outline"}
              size="sm"
              onClick={() => { setPeriodo(p); setPage(1); }}
            >
              {p === "7d" ? "Últimos 7 dias" : "Últimos 30 dias"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <div className="text-sm text-muted-foreground">
              {total} consulta(s) — custo total: <strong className="text-foreground">R$ {custoTotal.toFixed(2)}</strong>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!registros.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium">CNJ</th>
              <th className="p-3 text-left font-medium hidden md:table-cell">Tipo</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium hidden lg:table-cell">Custo</th>
              <th className="p-3 text-left font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <History className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhuma consulta no período selecionado</span>
                </div>
              </td></tr>
            ) : registros.map(r => {
              const statusInfo = STATUS_HIST[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-700" };
              return (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{formatCnj(r.processoCnj)}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground capitalize">{r.tipo?.replace("_", " ") ?? "-"}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">R$ {Number(r.custo).toFixed(2)}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {new Date(r.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} registro(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm flex items-center px-2">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function AdminJudit() {
  return (
    <div className="space-y-6">
      {/* Métricas */}
      <SecaoMetricas />

      {/* Tabs das 3 seções operacionais */}
      <Tabs defaultValue="fila" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="fila" className="flex items-center gap-1.5">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline">Fila de Consulta</span>
            <span className="sm:hidden">Fila</span>
          </TabsTrigger>
          <TabsTrigger value="cpf" className="flex items-center gap-1.5">
            <FileSearch className="h-4 w-4" />
            <span className="hidden sm:inline">Busca por CPF</span>
            <span className="sm:hidden">CPF</span>
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fila">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-yellow-600" />
                Fila de Consulta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SecaoFila />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cpf">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-blue-600" />
                Buscar processos por CPF na Judit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SecaoBuscaCpf />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-purple-600" />
                Histórico de consultas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SecaoHistorico />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
