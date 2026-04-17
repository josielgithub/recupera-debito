import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search, CheckCircle, Clock, AlertTriangle, DollarSign,
  RefreshCw, ListChecks, History, FileSearch, ChevronLeft, ChevronRight, Download, Brain, ExternalLink,
  TriangleAlert, RotateCcw, Pencil, ShieldCheck
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
  const { data: dataIA } = trpc.admin.metricsAnalisesIA.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const creditoRestante = data?.creditoRestante ?? 0;
  const limiteMensal = data?.limiteMensal ?? 1000;
  const pct = limiteMensal > 0 ? (creditoRestante / limiteMensal) * 100 : 0;
  const creditoCor = pct > 20 ? "text-green-600" : pct > 10 ? "text-orange-500" : "text-red-600";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Visão Geral</h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 text-xs">
          <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Crédito Judit */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className={`h-5 w-5 ${creditoCor}`} />
              <span className="text-xs text-muted-foreground">Crédito restante (mês)</span>
            </div>
            <div className="text-2xl font-bold">
              {isLoading ? "…" : <span className={creditoCor}>R$ {creditoRestante.toFixed(2)}</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">de R$ {limiteMensal.toFixed(2)}</div>
          </CardContent>
        </Card>
        {/* Card 2: Consultas */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <span className="text-xs text-muted-foreground">Consultas este mês</span>
            </div>
            <div className="text-2xl font-bold">{isLoading ? "…" : String(data?.consultasMes ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">Custo: R$ {(data?.custoMes ?? 0).toFixed(2)}</div>
          </CardContent>
        </Card>
        {/* Card 3: Processando */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="h-5 w-5 text-purple-600" />
              <span className="text-xs text-muted-foreground">Requisições processando</span>
            </div>
            <div className="text-2xl font-bold">{isLoading ? "…" : String(data?.requisicaoProcessando ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">em andamento na Judit</div>
          </CardContent>
        </Card>
        {/* Card 4: Fila */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <span className="text-xs text-muted-foreground">Processos na fila</span>
            </div>
            <div className="text-2xl font-bold">{isLoading ? "…" : String(data?.processosNaFila ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">aguardando aprovação</div>
          </CardContent>
        </Card>
        {/* Card 5: Análises IA */}
        <Card className="border shadow-sm border-indigo-100 dark:border-indigo-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-5 w-5 text-indigo-600" />
              <span className="text-xs text-muted-foreground">Análises IA geradas</span>
            </div>
            <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
              {isLoading ? "…" : String(dataIA?.totalMes ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              Custo: verificar
              <a
                href="https://manus.im/app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-indigo-500 hover:text-indigo-700 underline"
                title="manus.im/app → Configurações → Uso"
              >
                painel Manus <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
              </a>
            </div>
          </CardContent>
        </Card>
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
  // C1: requestKey para idempotência — gerado uma vez por sessão de aprovação
  const [requestKey, setRequestKey] = useState<string>(() => crypto.randomUUID());

  const { data: advogados } = trpc.admin.listarAdvogadosUsuarios.useQuery();
  const { data: metrics } = trpc.admin.metricsJudit.useQuery();
  const { data, isLoading, refetch } = trpc.admin.filaJuditFiltrada.useQuery(
    { page, pageSize: 50, busca: busca || undefined, advogadoId },
    { refetchInterval: 30_000 }
  );

  const utils = trpc.useUtils();
  const aprovar = trpc.admin.aprovarFilaJudit.useMutation({
    onSuccess: (res) => {
      const ok = res.resultados.filter((r: { ok: boolean }) => r.ok).length;
      const notFound = res.resultados.filter((r: { ok: boolean; notFound?: boolean }) => r.ok && r.notFound).length;
      const erro = res.resultados.filter((r: { ok: boolean }) => !r.ok).length;
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
    if (aprovar.isPending) return; // C1: debounce — impede duplo clique
    setProgresso({ atual: 0, total: selecionados.length });
    aprovar.mutate({ processoIds: selecionados, requestKey });
  };

  const handleAbrirConfirm = () => {
    // C1: gerar novo requestKey a cada abertura do dialog
    setRequestKey(crypto.randomUUID());
    setConfirmOpen(true);
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
          <Button size="sm" onClick={handleAbrirConfirm} disabled={aprovar.isPending}>
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
            <Button onClick={handleConfirmar} disabled={aprovar.isPending} variant={ultrapassaCredito ? "destructive" : "default"} type="button">
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
function SecaoHistoricoJudit() {
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

  const duplicatas = registros.filter(r => r.isDuplicata);
  const custoDuplicatas = duplicatas.reduce((acc, r) => acc + Number(r.custo), 0);

  const exportarCsv = () => {
    if (!registros.length) return;
    const header = ["CNJ", "Tipo", "Custo", "Status", "Duplicata", "Data"];
    const rows = registros.map(r => [
      r.processoCnj,
      r.tipo ?? "",
      Number(r.custo).toFixed(2),
      r.status,
      r.isDuplicata ? "Sim" : "Não",
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
            <div className="flex flex-col items-end gap-1">
              <div className="text-sm text-muted-foreground">
                {total} consulta(s) — custo total: <strong className="text-foreground">R$ {custoTotal.toFixed(2)}</strong>
              </div>
              {duplicatas.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-0.5">
                  <AlertTriangle className="h-3 w-3" />
                  {duplicatas.length} duplicata(s) — R$ {custoDuplicatas.toFixed(2)} gasto(s) desnecessariamente
                </div>
              )}
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
              <th className="p-3 text-left font-medium hidden lg:table-cell">Duplicata</th>
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
                <tr key={r.id} className={`border-t hover:bg-muted/30 ${r.isDuplicata ? "bg-orange-50/40 dark:bg-orange-950/20" : ""}`}>
                  <td className="p-3 font-mono text-xs">{formatCnj(r.processoCnj)}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground capitalize">{r.tipo?.replace("_", " ") ?? "-"}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">R$ {Number(r.custo).toFixed(2)}</td>
                  <td className="p-3 hidden lg:table-cell">
                    {r.isDuplicata ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        <AlertTriangle className="h-3 w-3" /> Duplicata
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
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
function SecaoHistoricoIA() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.admin.listAnalisesIA.useQuery({ page, pageSize: 50 });

  const registros = data?.registros ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {total > 0 ? `${total} análise(s) registrada(s)` : ""}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Brain className="h-3.5 w-3.5 text-indigo-500" />
          Custo: consulte
          <a
            href="https://manus.im/app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-500 hover:text-indigo-700 underline inline-flex items-center gap-0.5"
          >
            manus.im/app <ExternalLink className="h-2.5 w-2.5" />
          </a>
          → Configurações → Uso
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium">CNJ</th>
              <th className="p-3 text-left font-medium hidden md:table-cell">Solicitado por</th>
              <th className="p-3 text-left font-medium hidden lg:table-cell">Tokens (entrada/saída)</th>
              <th className="p-3 text-left font-medium hidden lg:table-cell">Modelo</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <Brain className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhuma análise IA registrada ainda</span>
                </div>
              </td></tr>
            ) : registros.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-mono text-xs">{formatCnj(r.processoCnj)}</td>
                <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{r.nomeUsuario ?? `#${r.solicitadoPor}`}</td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                  {r.tokensEntrada != null && r.tokensSaida != null
                    ? `${r.tokensEntrada} / ${r.tokensSaida}`
                    : "-"}
                </td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                  {r.modelo ? <span className="font-mono">{r.modelo}</span> : "-"}
                </td>
                <td className="p-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.sucesso ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}>
                    {r.sucesso ? "Sucesso" : "Erro"}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground text-xs">
                  {new Date(r.solicitadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))}
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

function SecaoHistorico() {
  const [aba, setAba] = useState<"judit" | "ia">("judit");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-3">
        <Button
          variant={aba === "judit" ? "default" : "outline"}
          size="sm"
          onClick={() => setAba("judit")}
          className="flex items-center gap-1.5"
        >
          <History className="h-4 w-4" /> Consultas Judit
        </Button>
        <Button
          variant={aba === "ia" ? "default" : "outline"}
          size="sm"
          onClick={() => setAba("ia")}
          className="flex items-center gap-1.5"
        >
          <Brain className="h-4 w-4" /> Análises IA
        </Button>
      </div>
      {aba === "judit" ? <SecaoHistoricoJudit /> : <SecaoHistoricoIA />}
    </div>
  );
}

// ─── Seção 5: Problemas Registrados ─────────────────────────────────────────
function SecaoProblemas() {
  const [apenasNaoResolvidos, setApenasNaoResolvidos] = useState(true);
  const [editObsId, setEditObsId] = useState<number | null>(null);
  const [obsText, setObsText] = useState("");

  const utils = trpc.useUtils();

  const detectar = trpc.juditProblemas.detectarTimeouts.useMutation({
    onSuccess: (res) => {
      if (res.registrados > 0) {
        toast.warning(`${res.registrados} novo(s) problema(s) detectado(s)`);
      } else {
        toast.success("Nenhum novo problema detectado");
      }
      utils.juditProblemas.listar.invalidate();
      utils.juditProblemas.contagem.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data, isLoading, refetch } = trpc.juditProblemas.listar.useQuery(
    { apenasNaoResolvidos },
    { refetchOnMount: true }
  );

  const marcarResolvido = trpc.juditProblemas.marcarResolvido.useMutation({
    onSuccess: () => {
      toast.success("Problema marcado como resolvido");
      utils.juditProblemas.listar.invalidate();
      utils.juditProblemas.contagem.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const tentarNovamente = trpc.juditProblemas.tentarNovamente.useMutation({
    onSuccess: () => {
      toast.success("Processo reinserido na fila Judit");
      utils.juditProblemas.listar.invalidate();
      utils.admin.filaJuditFiltrada.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarObs = trpc.juditProblemas.atualizarObservacao.useMutation({
    onSuccess: () => {
      toast.success("Observação atualizada");
      setEditObsId(null);
      utils.juditProblemas.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Verificar timeouts automaticamente ao abrir a tela
  useEffect(() => {
    detectar.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problemas = data ?? [];

  const TIPO_MAP: Record<string, { label: string; color: string }> = {
    timeout: { label: "Timeout", color: "bg-orange-100 text-orange-800" },
    nao_encontrado: { label: "Não encontrado", color: "bg-gray-100 text-gray-700" },
    erro_api: { label: "Erro API", color: "bg-red-100 text-red-800" },
    webhook_nao_recebido: { label: "Webhook não recebido", color: "bg-yellow-100 text-yellow-800" },
  };

  const exportarCsv = () => {
    if (!problemas.length) return;
    const header = ["ID", "CNJ", "Tipo", "Descrição", "Enviado em", "Detectado em", "Tentativas", "Resolvido", "Observação"];
    const rows = problemas.map(p => [
      p.id,
      p.processoCnj,
      p.tipo,
      p.descricao.replace(/;/g, ","),
      new Date(p.enviadoEm).toLocaleString("pt-BR"),
      new Date(p.detectadoEm).toLocaleString("pt-BR"),
      p.tentativas,
      p.resolvido ? "Sim" : "Não",
      (p.observacao ?? "").replace(/;/g, ","),
    ]);
    const csv = [header, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `problemas-judit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={apenasNaoResolvidos}
              onCheckedChange={v => setApenasNaoResolvidos(!!v)}
            />
            Apenas não resolvidos
          </label>
          {!apenasNaoResolvidos && problemas.length > 0 && (
            <span className="text-sm text-muted-foreground">{problemas.length} problema(s)</span>
          )}
          {apenasNaoResolvidos && problemas.length > 0 && (
            <Badge variant="destructive" className="text-xs">{problemas.length} não resolvido(s)</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => detectar.mutate()}
            disabled={detectar.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${detectar.isPending ? "animate-spin" : ""}`} />
            Verificar timeouts
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!problemas.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium">CNJ</th>
              <th className="p-3 text-left font-medium hidden md:table-cell">Tipo</th>
              <th className="p-3 text-left font-medium hidden lg:table-cell">Descrição</th>
              <th className="p-3 text-left font-medium hidden md:table-cell">Tentativas</th>
              <th className="p-3 text-left font-medium hidden lg:table-cell">Detectado em</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : problemas.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <ShieldCheck className="h-8 w-8 text-green-500/60" />
                  <span>Nenhum problema registrado</span>
                </div>
              </td></tr>
            ) : problemas.map(p => {
              const tipoInfo = TIPO_MAP[p.tipo] ?? { label: p.tipo, color: "bg-gray-100 text-gray-700" };
              return (
                <tr key={p.id} className={`border-t hover:bg-muted/30 ${p.resolvido ? "opacity-60" : ""}`}>
                  <td className="p-3 font-mono text-xs">{formatCnj(p.processoCnj)}</td>
                  <td className="p-3 hidden md:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tipoInfo.color}`}>
                      {tipoInfo.label}
                    </span>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs max-w-xs truncate" title={p.descricao}>
                    {p.descricao}
                  </td>
                  <td className="p-3 hidden md:table-cell text-center">
                    <Badge variant="outline" className="text-xs">{p.tentativas}</Badge>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {new Date(p.detectadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-3">
                    {p.resolvido ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3" /> Resolvido
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <TriangleAlert className="h-3 w-3" /> Pendente
                      </span>
                    )}
                    {p.observacao && (
                      <div className="text-xs text-muted-foreground mt-1 italic truncate max-w-[120px]" title={p.observacao}>
                        {p.observacao}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {!p.resolvido && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-green-700 hover:text-green-900"
                            onClick={() => marcarResolvido.mutate({ id: p.id })}
                            disabled={marcarResolvido.isPending}
                            title="Marcar como resolvido"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Resolver
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-blue-700 hover:text-blue-900"
                            onClick={() => tentarNovamente.mutate({ id: p.id, processoCnj: p.processoCnj })}
                            disabled={tentarNovamente.isPending}
                            title="Reinserir na fila Judit"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Tentar
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => { setEditObsId(p.id); setObsText(p.observacao ?? ""); }}
                        title="Editar observação"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Dialog: Editar observação */}
      <Dialog open={editObsId !== null} onOpenChange={open => { if (!open) setEditObsId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar observação</DialogTitle>
          </DialogHeader>
          <Textarea
            value={obsText}
            onChange={e => setObsText(e.target.value)}
            placeholder="Adicione uma observação sobre este problema..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditObsId(null)}>Cancelar</Button>
            <Button
              onClick={() => { if (editObsId !== null) atualizarObs.mutate({ id: editObsId, observacao: obsText }); }}
              disabled={atualizarObs.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminJudit() {
  const { data: contagem } = trpc.juditProblemas.contagem.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const naoResolvidos = contagem?.naoResolvidos ?? 0;

  return (
    <div className="space-y-6">
      {/* Métricas */}
      <SecaoMetricas />

      {/* Tabs das 4 seções operacionais */}
      <Tabs defaultValue="fila" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
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
            <span className="hidden sm:inline">Histórico</span>
            <span className="sm:hidden">Hist.</span>
          </TabsTrigger>
          <TabsTrigger value="problemas" className="flex items-center gap-1.5">
            <TriangleAlert className="h-4 w-4" />
            <span className="hidden sm:inline">Problemas</span>
            <span className="sm:hidden">Prob.</span>
            {naoResolvidos > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 px-1">
                {naoResolvidos}
              </span>
            )}
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

        <TabsContent value="problemas">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TriangleAlert className="h-4 w-4 text-orange-600" />
                Problemas Registrados
                {naoResolvidos > 0 && (
                  <Badge variant="destructive" className="text-xs ml-1">{naoResolvidos} não resolvido(s)</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SecaoProblemas />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
