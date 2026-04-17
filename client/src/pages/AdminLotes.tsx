import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Plus, Trash2, Upload, Download, CheckCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Layers, Users, FileText,
  BarChart2, X, RefreshCw
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatPercent(v: string | number | null | undefined) {
  if (v == null) return "0%";
  return `${Number(v).toFixed(2)}%`;
}

// ─── Indicador de percentual ──────────────────────────────────────────────────
function IndicadorPercentual({ total }: { total: number }) {
  const disponivel = 49 - total;
  const color = disponivel > 10 ? "text-green-600" : disponivel >= 1 ? "text-orange-500" : "text-red-600";
  const bgColor = disponivel > 10
    ? "bg-green-50 border-green-200"
    : disponivel >= 1
    ? "bg-orange-50 border-orange-200"
    : "bg-red-50 border-red-200";
  return (
    <div className={`rounded-lg border px-4 py-2 text-sm font-medium ${bgColor}`}>
      <span className="text-muted-foreground">Total alocado: </span>
      <span className="font-bold">{total.toFixed(2)}%</span>
      <span className="mx-2 text-muted-foreground">—</span>
      <span className="text-muted-foreground">Disponível: </span>
      <span className={`font-bold ${color}`}>{disponivel.toFixed(2)}% dos 49%</span>
    </div>
  );
}

// ─── Modal Novo Lote ──────────────────────────────────────────────────────────
interface ModalNovoLoteProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ModalNovoLote({ open, onClose, onSuccess }: ModalNovoLoteProps) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [advogadoId, setAdvogadoId] = useState<string>("");
  const [percEmpresa, setPercEmpresa] = useState<string>("0");
  const [percAdvogado, setPercAdvogado] = useState<string>("0");
  const [investidores, setInvestidores] = useState<Array<{ usuarioId: string; percentual: string }>>([]);

  const { data: advogados } = trpc.admin.listarAdvogadosUsuarios.useQuery();
  const { data: investidoresList } = trpc.admin.listarInvestidoresUsuarios.useQuery();

  const utils = trpc.useUtils();
  const criarLote = trpc.admin.novoLote.useMutation({
    onSuccess: () => {
      toast.success("Lote criado com sucesso!");
      utils.admin.listarLotes.invalidate();
      onSuccess();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setNome(""); setDescricao(""); setAdvogadoId("");
    setPercEmpresa("0"); setPercAdvogado("0"); setInvestidores([]);
  }

  const totalAlocado = Number(percEmpresa || 0) + Number(percAdvogado || 0)
    + investidores.reduce((acc, i) => acc + Number(i.percentual || 0), 0);
  const ultrapassou = totalAlocado > 49;

  function addInvestidor() {
    setInvestidores(prev => [...prev, { usuarioId: "", percentual: "0" }]);
  }

  function removeInvestidor(idx: number) {
    setInvestidores(prev => prev.filter((_, i) => i !== idx));
  }

  function updateInvestidor(idx: number, field: "usuarioId" | "percentual", value: string) {
    setInvestidores(prev => prev.map((inv, i) => i === idx ? { ...inv, [field]: value } : inv));
  }

  function handleSalvar() {
    if (!nome.trim()) { toast.error("Nome do lote é obrigatório"); return; }
    if (ultrapassou) { toast.error("Soma dos percentuais ultrapassa 49%"); return; }
    const invValidos = investidores.filter(i => i.usuarioId && Number(i.percentual) > 0);
    criarLote.mutate({
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      advogadoId: advogadoId && advogadoId !== "none" ? Number(advogadoId) : null,
      percentualEmpresa: Number(percEmpresa || 0),
      percentualAdvogado: Number(percAdvogado || 0),
      investidores: invValidos.map(i => ({ usuarioId: Number(i.usuarioId), percentual: Number(i.percentual) })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Novo Lote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome do lote *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Lote Janeiro 2026" />
            </div>
            <div className="col-span-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do lote..." rows={2} />
            </div>
            <div className="col-span-2">
              <Label>Advogado responsável</Label>
              <Select value={advogadoId} onValueChange={setAdvogadoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar advogado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {advogados?.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name ?? a.email ?? `ID ${a.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Percentual da empresa (%)</Label>
              <Input type="number" min="0" max="49" step="0.01" value={percEmpresa}
                onChange={e => setPercEmpresa(e.target.value)} />
            </div>
            <div>
              <Label>Percentual do advogado (%)</Label>
              <Input type="number" min="0" max="49" step="0.01" value={percAdvogado}
                onChange={e => setPercAdvogado(e.target.value)} />
            </div>
          </div>

          {/* Investidores */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Investidores</Label>
              <Button type="button" variant="outline" size="sm" onClick={addInvestidor}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar investidor
              </Button>
            </div>
            {investidores.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                Nenhum investidor adicionado
              </p>
            )}
            <div className="space-y-2">
              {investidores.map((inv, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={inv.usuarioId} onValueChange={v => updateInvestidor(idx, "usuarioId", v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar investidor" /></SelectTrigger>
                    <SelectContent>
                      {investidoresList?.map(i => (
                        <SelectItem key={i.id} value={String(i.id)}>{i.name ?? i.email ?? `ID ${i.id}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="0" max="49" step="0.01" value={inv.percentual}
                    onChange={e => updateInvestidor(idx, "percentual", e.target.value)}
                    className="w-28" placeholder="%" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeInvestidor(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <IndicadorPercentual total={totalAlocado} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={ultrapassou || criarLote.isPending}>
            {criarLote.isPending ? "Criando..." : "Criar lote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal Importar Processos ─────────────────────────────────────────────────
interface ModalImportarProps {
  loteId: number;
  loteNome: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ModalImportarProcessos({ loteId, loteNome, open, onClose, onSuccess }: ModalImportarProps) {
  const [cnjs, setCnjs] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [resultado, setResultado] = useState<{ vinculados: number; erros: number } | null>(null);

  const utils = trpc.useUtils();
  const importar = trpc.admin.importarProcessosLote.useMutation({
    onSuccess: (data) => {
      setResultado({ vinculados: data.vinculados, erros: data.erros });
      toast.success(`${data.vinculados} processos vinculados, ${data.erros} erros`);
      utils.admin.listarLotes.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  function parsePlanilha(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const cnjsExtraidos = rows
          .map(r => {
            const val = r["cnj"] ?? r["CNJ"] ?? r["Cnj"] ?? Object.values(r)[0];
            return String(val ?? "").trim();
          })
          .filter(v => v.length > 0);
        setCnjs(cnjsExtraidos);
        setFileName(file.name);
        setResultado(null);
      } catch {
        toast.error("Erro ao ler planilha. Verifique o formato.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parsePlanilha(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parsePlanilha(file);
  }

  function baixarModelo() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["cnj"], ["0000000-00.0000.0.00.0000"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_importacao_lote.xlsx");
  }

  function handleImportar() {
    if (cnjs.length === 0) { toast.error("Nenhum CNJ encontrado na planilha"); return; }
    importar.mutate({ loteId, cnjs });
  }

  function handleClose() {
    setCnjs([]); setFileName(""); setResultado(null); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar processos para {loteNome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Coluna esperada:</span>
            <Badge variant="secondary" className="font-mono">cnj</Badge>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input-lote")?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            {fileName ? (
              <p className="text-sm font-medium text-primary">{fileName} — {cnjs.length} CNJs encontrados</p>
            ) : (
              <>
                <p className="text-sm font-medium">Arraste e solte ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">Aceita .xlsx, .xls, .csv</p>
              </>
            )}
            <input id="file-input-lote" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          </div>

          {resultado && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">Resultado da importação:</p>
              <p className="text-green-600">{resultado.vinculados} processos vinculados com sucesso</p>
              {resultado.erros > 0 && <p className="text-orange-500">{resultado.erros} erros registrados (veja a aba Erros)</p>}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={baixarModelo} className="sm:mr-auto">
            <Download className="h-4 w-4 mr-1" /> Baixar modelo
          </Button>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleImportar} disabled={cnjs.length === 0 || importar.isPending}>
            {importar.isPending ? "Importando..." : `Importar${cnjs.length > 0 ? ` (${cnjs.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detalhe do Lote ──────────────────────────────────────────────────────────
interface DetalheLoteProps {
  loteId: number;
  loteNome: string;
  percentualEmpresa: number;
  percentualAdvogado: number;
  investidores: Array<{ investidorId: number; investidorNome: string | null; percentual: string }>;
  onRefresh: () => void;
}

function DetalheLote({ loteId, loteNome, percentualEmpresa, percentualAdvogado, investidores, onRefresh }: DetalheLoteProps) {
  const [tab, setTab] = useState("processos");
  const [page, setPage] = useState(1);
  const [modalImportar, setModalImportar] = useState(false);

  const utils = trpc.useUtils();

  const { data: processosData, refetch: refetchProcessos } = trpc.admin.processosDoLote.useQuery(
    { loteId, page, pageSize: 20 },
    { enabled: tab === "processos" }
  );
  const { data: erros, refetch: refetchErros } = trpc.admin.errosDoLote.useQuery(
    { loteId },
    { enabled: tab === "erros" }
  );

  const desvincular = trpc.admin.desvincularProcessoLote.useMutation({
    onSuccess: () => {
      toast.success("Processo desvinculado");
      refetchProcessos();
      utils.admin.listarLotes.invalidate();
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const resolverErro = trpc.admin.resolverErroLote.useMutation({
    onSuccess: () => {
      toast.success("Erro marcado como resolvido");
      refetchErros();
      utils.admin.listarLotes.invalidate();
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const errosNaoResolvidos = erros?.filter(e => !e.resolvido).length ?? 0;
  const totalProcessos = processosData?.total ?? 0;
  const valorTotal = processosData?.valorTotalDisputa ?? 0;

  function calcProjecao(percentual: number) {
    return (valorTotal * 0.49 * percentual) / 100;
  }

  function exportarErrosCSV() {
    if (!erros || erros.length === 0) return;
    const rows = erros.map(e => ({
      CNJ: e.cnj,
      Motivo: e.motivo,
      "Lote atual": e.loteAtualNome ?? "",
      "Importado em": formatDate(e.importadoEm),
      Resolvido: e.resolvido ? "Sim" : "Não",
      Observação: e.observacao ?? "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Erros");
    XLSX.writeFile(wb, `erros_lote_${loteId}.csv`);
  }

  const motivoBadge = (motivo: string) => {
    if (motivo === "nao_encontrado_banco") return <Badge variant="destructive" className="text-xs">Não encontrado</Badge>;
    if (motivo === "processo_ja_em_lote") return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Já em lote</Badge>;
    return <Badge variant="secondary" className="text-xs">CNJ inválido</Badge>;
  };

  return (
    <div className="mt-4 border rounded-lg bg-muted/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Detalhes: {loteNome}
        </h3>
        <Button size="sm" onClick={() => setModalImportar(true)}>
          <Upload className="h-4 w-4 mr-1" /> Importar processos
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="processos">
            <FileText className="h-4 w-4 mr-1" />
            Processos ({totalProcessos})
          </TabsTrigger>
          <TabsTrigger value="erros">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Erros
            {errosNaoResolvidos > 0 && (
              <Badge className="ml-1 h-5 px-1.5 text-xs bg-red-500 text-white">{errosNaoResolvidos}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="projecao">
            <BarChart2 className="h-4 w-4 mr-1" />
            Projeção
          </TabsTrigger>
        </TabsList>

        {/* Aba Processos */}
        <TabsContent value="processos">
          {!processosData ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : processosData.processos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum processo vinculado. Use "Importar processos" para adicionar.
            </p>
          ) : (
            <>
              <div className="text-sm text-muted-foreground mb-2">
                Valor total em disputa: <span className="font-semibold text-foreground">{formatCurrency(valorTotal)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4">CNJ</th>
                      <th className="text-left py-2 pr-4">Cliente</th>
                      <th className="text-left py-2 pr-4">Status</th>
                      <th className="text-right py-2 pr-4">Valor obtido</th>
                      <th className="text-left py-2 pr-4">Atualizado</th>
                      <th className="text-right py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processosData.processos.map(p => (
                      <tr key={p.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 pr-4 font-mono text-xs">{p.cnj}</td>
                        <td className="py-2 pr-4">{p.clienteNome ?? "-"}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-xs">{p.statusResumido ?? "-"}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatCurrency(p.valorObtido ? Number(p.valorObtido) : null)}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{formatDate(p.updatedAt)}</td>
                        <td className="py-2 text-right">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                  onClick={() => {
                                    if (confirm("Desvincular este processo do lote?")) {
                                      desvincular.mutate({ processoId: p.id });
                                    }
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Desvincular processo</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {processosData.total > 20 && (
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">
                    {(page - 1) * 20 + 1}–{Math.min(page * 20, processosData.total)} de {processosData.total}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage(p => p + 1)} disabled={page * 20 >= processosData.total}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Aba Erros */}
        <TabsContent value="erros">
          <div className="flex justify-end mb-2">
            <Button variant="outline" size="sm" onClick={exportarErrosCSV} disabled={!erros || erros.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>
          {!erros ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : erros.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum erro de importação registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-4">CNJ</th>
                    <th className="text-left py-2 pr-4">Motivo</th>
                    <th className="text-left py-2 pr-4">Lote atual</th>
                    <th className="text-left py-2 pr-4">Importado em</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {erros.map(e => (
                    <tr key={e.id} className={`border-b hover:bg-muted/50 ${e.resolvido ? "opacity-50" : ""}`}>
                      <td className="py-2 pr-4 font-mono text-xs">{e.cnj}</td>
                      <td className="py-2 pr-4">{motivoBadge(e.motivo)}</td>
                      <td className="py-2 pr-4 text-xs">{e.loteAtualNome ?? "-"}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{formatDate(e.importadoEm)}</td>
                      <td className="py-2 pr-4">
                        {e.resolvido
                          ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />Resolvido
                            </Badge>
                          : <Badge variant="outline" className="text-xs">Pendente</Badge>
                        }
                      </td>
                      <td className="py-2 text-right">
                        {!e.resolvido && (
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs"
                            onClick={() => resolverErro.mutate({ erroId: e.id, observacao: null })}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Resolver
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Aba Projeção */}
        <TabsContent value="projecao">
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Projeção baseada no valor total em disputa ({formatCurrency(valorTotal)}) × 49% disponível para distribuição.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-4">Participante</th>
                    <th className="text-right py-2 pr-4">Percentual</th>
                    <th className="text-right py-2">Projeção</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Empresa</td>
                    <td className="py-2 pr-4 text-right">{formatPercent(percentualEmpresa)}</td>
                    <td className="py-2 text-right font-semibold text-green-600">{formatCurrency(calcProjecao(percentualEmpresa))}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Advogado</td>
                    <td className="py-2 pr-4 text-right">{formatPercent(percentualAdvogado)}</td>
                    <td className="py-2 text-right font-semibold text-blue-600">{formatCurrency(calcProjecao(percentualAdvogado))}</td>
                  </tr>
                  {investidores.map(inv => (
                    <tr key={inv.investidorId} className="border-b">
                      <td className="py-2 pr-4">{inv.investidorNome ?? `Investidor #${inv.investidorId}`}</td>
                      <td className="py-2 pr-4 text-right">{formatPercent(inv.percentual)}</td>
                      <td className="py-2 text-right font-semibold text-purple-600">{formatCurrency(calcProjecao(Number(inv.percentual)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              * 51% do valor vai sempre para o cliente. Os 49% restantes são distribuídos conforme os percentuais acima.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <ModalImportarProcessos
        loteId={loteId}
        loteNome={loteNome}
        open={modalImportar}
        onClose={() => setModalImportar(false)}
        onSuccess={() => { setModalImportar(false); refetchProcessos(); onRefresh(); }}
      />
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function AdminLotes() {
  const [modalNovoLote, setModalNovoLote] = useState(false);
  const [loteExpandido, setLoteExpandido] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: lotes, refetch, isLoading } = trpc.admin.listarLotes.useQuery();

  const toggleExpand = useCallback((id: number) => {
    setLoteExpandido(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Lotes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie agrupamentos de processos por investidores e percentuais de distribuição.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <Button onClick={() => setModalNovoLote(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo lote
          </Button>
        </div>
      </div>

      {/* Tabela de lotes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lotes cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando lotes...</p>
          ) : !lotes || lotes.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nenhum lote cadastrado ainda.</p>
              <Button className="mt-4" onClick={() => setModalNovoLote(true)}>
                <Plus className="h-4 w-4 mr-1" /> Criar primeiro lote
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-3 pr-4">Nome</th>
                    <th className="text-left py-3 pr-4">Advogado</th>
                    <th className="text-right py-3 pr-4">Empresa %</th>
                    <th className="text-right py-3 pr-4">Advogado %</th>
                    <th className="text-right py-3 pr-4">Investidores</th>
                    <th className="text-right py-3 pr-4">Processos</th>
                    <th className="text-left py-3 pr-4">Criado em</th>
                    <th className="text-right py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map(lote => (
                    <>
                      <tr
                        key={lote.id}
                        className={`border-b cursor-pointer hover:bg-muted/50 transition-colors ${loteExpandido === lote.id ? "bg-muted/30" : ""}`}
                        onClick={() => toggleExpand(lote.id)}
                      >
                        <td className="py-3 pr-4 font-medium">
                          <div className="flex items-center gap-2">
                            {lote.nome}
                            {lote.errosNaoResolvidos > 0 && (
                              <Badge className="h-5 px-1.5 text-xs bg-red-500 text-white">
                                {lote.errosNaoResolvidos} erros
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs">{lote.advogadoNome ?? "-"}</td>
                        <td className="py-3 pr-4 text-right">{formatPercent(lote.percentualEmpresa)}</td>
                        <td className="py-3 pr-4 text-right">{formatPercent(lote.percentualAdvogado)}</td>
                        <td className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {lote.totalInvestidores}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right">{lote.totalProcessos}</td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(lote.createdAt)}</td>
                        <td className="py-3 text-right">
                          <Button
                            variant="outline" size="sm"
                            onClick={e => { e.stopPropagation(); toggleExpand(lote.id); }}
                          >
                            {loteExpandido === lote.id ? "Fechar" : "Ver detalhes"}
                          </Button>
                        </td>
                      </tr>
                      {loteExpandido === lote.id && (
                        <tr key={`detail-${lote.id}`}>
                          <td colSpan={8} className="px-2 pb-4">
                            <DetalheLote
                              loteId={lote.id}
                              loteNome={lote.nome}
                              percentualEmpresa={Number(lote.percentualEmpresa)}
                              percentualAdvogado={Number(lote.percentualAdvogado)}
                              investidores={lote.investidores}
                              onRefresh={() => utils.admin.listarLotes.invalidate()}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ModalNovoLote
        open={modalNovoLote}
        onClose={() => setModalNovoLote(false)}
        onSuccess={() => setModalNovoLote(false)}
      />
    </div>
  );
}
