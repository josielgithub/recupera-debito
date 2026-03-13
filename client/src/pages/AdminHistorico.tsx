import { useState, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
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
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Phone,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatarData(data: Date | string | null | undefined): string {
  if (!data) return "—";
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatarDataCurta(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function BadgeResultado({ resultado }: { resultado: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    encontrado: { label: "Encontrado", cls: "bg-green-100 text-green-800" },
    nao_encontrado: { label: "Não encontrado", cls: "bg-gray-100 text-gray-700" },
    bloqueado: { label: "Bloqueado", cls: "bg-red-100 text-red-800" },
  };
  const { label, cls } = map[resultado] ?? { label: resultado, cls: "bg-gray-100 text-gray-700" };
  return <Badge className={`text-xs border-0 ${cls}`}>{label}</Badge>;
}

// ─── Tooltip customizado do gráfico ────────────────────────────────────────────────────
function TooltipGrafico({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const [y, m, d] = (label ?? "").split("-");
  const dataFormatada = `${d}/${m}/${y}`;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-foreground mb-2">{dataFormatada}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">
            {p.name === "encontrado" ? "Encontrado" :
             p.name === "nao_encontrado" ? "Não encontrado" :
             p.name === "bloqueado" ? "Bloqueado" : "Total"}
          </span>
          <span className="font-semibold text-foreground ml-auto pl-3">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function AdminHistorico() {
  const [pagina, setPagina] = useState(1);
  const [periodoGrafico, setPeriodoGrafico] = useState<7 | 15 | 30>(30);
  const [resultado, setResultado] = useState<string>("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [telefone, setTelefone] = useState("");
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    resultado: "",
    dataInicio: "",
    dataFim: "",
    telefone: "",
  });

  const { data: dadosGrafico, isLoading: loadingGrafico } = trpc.admin.graficoConsultasDiarias.useQuery(
    { dias: periodoGrafico },
    { refetchOnWindowFocus: false }
  );

  // Formata datas para exibição no eixo X (dd/mm)
  const dadosGraficoFormatados = useMemo(() =>
    (dadosGrafico ?? []).map((d) => ({
      ...d,
      dataLabel: d.data.slice(5).replace("-", "/"),
    })),
    [dadosGrafico]
  );

  const totalGrafico = useMemo(() =>
    (dadosGrafico ?? []).reduce((acc, d) => acc + d.total, 0),
    [dadosGrafico]
  );

  const { data, isLoading } = trpc.admin.historicoConsultas.useQuery({
    page: pagina,
    resultado: filtrosAplicados.resultado as "encontrado" | "nao_encontrado" | "bloqueado" | undefined || undefined,
    dataInicio: filtrosAplicados.dataInicio || undefined,
    dataFim: filtrosAplicados.dataFim || undefined,
    telefone: filtrosAplicados.telefone || undefined,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / 50);

  const filtrosAtivos = [
    !!filtrosAplicados.resultado,
    !!filtrosAplicados.dataInicio,
    !!filtrosAplicados.dataFim,
    !!filtrosAplicados.telefone,
  ].filter(Boolean).length;

  const aplicarFiltros = useCallback(() => {
    setPagina(1);
    setFiltrosAplicados({ resultado, dataInicio, dataFim, telefone });
  }, [resultado, dataInicio, dataFim, telefone]);

  const limparFiltros = useCallback(() => {
    setResultado("");
    setDataInicio("");
    setDataFim("");
    setTelefone("");
    setFiltrosAplicados({ resultado: "", dataInicio: "", dataFim: "", telefone: "" });
    setPagina(1);
  }, []);

  function exportarCsv() {
    if (logs.length === 0) {
      toast.error("Nenhum dado para exportar.");
      return;
    }
    const cabecalho = ["ID", "CPF (mascarado)", "Telefone", "Resultado", "IP (hash)", "Data/Hora"];
    const linhas = logs.map((l) => [
      l.id,
      l.cpfMascarado ?? "—",
      l.telefone ?? "—",
      l.resultado,
      l.ipHash.slice(0, 16) + "…",
      formatarData(l.createdAt),
    ]);
    const csv = [cabecalho, ...linhas]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico_consultas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  }

  return (
    <div className="space-y-4">

      {/* ─── Card do Gráfico ─── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Volume de consultas diárias
              {totalGrafico > 0 && (
                <Badge variant="outline" className="ml-1 text-xs">{totalGrafico} total</Badge>
              )}
            </CardTitle>
            {/* Seletor de período */}
            <div className="flex items-center gap-1">
              {([7, 15, 30] as const).map((d) => (
                <Button
                  key={d}
                  variant={periodoGrafico === d ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => setPeriodoGrafico(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          {loadingGrafico ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : totalGrafico === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Activity className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">Nenhuma consulta nos últimos {periodoGrafico} dias.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={dadosGraficoFormatados}
                margin={{ top: 8, right: 16, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="dataLabel"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={periodoGrafico === 7 ? 0 : periodoGrafico === 15 ? 1 : 4}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<TooltipGrafico />} />
                <Legend
                  formatter={(value) =>
                    value === "encontrado" ? "Encontrado" :
                    value === "nao_encontrado" ? "Não encontrado" :
                    value === "bloqueado" ? "Bloqueado" : value
                  }
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Line
                  type="monotone"
                  dataKey="encontrado"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="nao_encontrado"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="bloqueado"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ─── Card de Filtros e Tabela ─── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Histórico de consultas públicas
              <Badge variant="outline" className="ml-1 text-xs">{total}</Badge>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={exportarCsv}
              disabled={logs.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>

          {/* Painel de filtros */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Resultado */}
            <Select
              value={resultado || "_todos"}
              onValueChange={(v) => setResultado(v === "_todos" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Todos os resultados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_todos">Todos os resultados</SelectItem>
                <SelectItem value="encontrado">Encontrado</SelectItem>
                <SelectItem value="nao_encontrado">Não encontrado</SelectItem>
                <SelectItem value="bloqueado">Bloqueado</SelectItem>
              </SelectContent>
            </Select>

            {/* Telefone */}
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Buscar por telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className="h-8 text-xs pl-7"
              />
            </div>

            {/* Data início */}
            <div className="relative">
              <label className="absolute -top-4 left-0 text-[10px] text-muted-foreground">A partir de</label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {/* Data fim */}
            <div className="relative">
              <label className="absolute -top-4 left-0 text-[10px] text-muted-foreground">Até</label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={aplicarFiltros}
            >
              <Search className="w-3.5 h-3.5" />
              Aplicar filtros
            </Button>
            {filtrosAtivos > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground gap-1"
                onClick={limparFiltros}
              >
                <X className="w-3.5 h-3.5" />
                Limpar filtros ({filtrosAtivos})
              </Button>
            )}
          </div>

          {/* Badges de filtros ativos */}
          {filtrosAtivos > 0 && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtros:</span>
              {filtrosAplicados.resultado && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  <Filter className="w-2.5 h-2.5" />
                  {filtrosAplicados.resultado === "encontrado" ? "Encontrado" :
                   filtrosAplicados.resultado === "nao_encontrado" ? "Não encontrado" : "Bloqueado"}
                  <button onClick={() => { setResultado(""); setFiltrosAplicados(f => ({ ...f, resultado: "" })); setPagina(1); }} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.telefone && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  Tel: {filtrosAplicados.telefone}
                  <button onClick={() => { setTelefone(""); setFiltrosAplicados(f => ({ ...f, telefone: "" })); setPagina(1); }} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.dataInicio && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  A partir de {formatarDataCurta(filtrosAplicados.dataInicio)}
                  <button onClick={() => { setDataInicio(""); setFiltrosAplicados(f => ({ ...f, dataInicio: "" })); setPagina(1); }} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {filtrosAplicados.dataFim && (
                <Badge variant="secondary" className="text-xs gap-1 pr-1">
                  Até {formatarDataCurta(filtrosAplicados.dataFim)}
                  <button onClick={() => { setDataFim(""); setFiltrosAplicados(f => ({ ...f, dataFim: "" })); setPagina(1); }} className="ml-0.5 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        <Separator />

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">
                {filtrosAtivos > 0
                  ? "Nenhum registro encontrado para os filtros aplicados."
                  : "Nenhuma consulta registrada ainda."}
              </p>
              {filtrosAtivos > 0 && (
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={limparFiltros}>
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
                    <TableHead className="text-xs font-semibold">CPF (mascarado)</TableHead>
                    <TableHead className="text-xs font-semibold">Telefone</TableHead>
                    <TableHead className="text-xs font-semibold">Resultado</TableHead>
                    <TableHead className="text-xs font-semibold">IP (hash)</TableHead>
                    <TableHead className="text-xs font-semibold">Data/Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.cpfMascarado ?? (
                          <span className="italic text-muted-foreground/50">oculto</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {log.telefone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            {log.telefone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BadgeResultado resultado={log.resultado} />
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.ipHash.slice(0, 16)}…
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatarData(log.createdAt)}
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
                <span className="ml-1 text-primary font-medium">
                  ({total} registro{total !== 1 ? "s" : ""})
                </span>
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
                <span className="text-xs text-muted-foreground px-2">{pagina}</span>
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
    </div>
  );
}
