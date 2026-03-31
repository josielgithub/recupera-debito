import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  RefreshCw,
  Clock,
  Search,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

interface DetalheImportacao {
  linha: number;
  cnj: string;
  nomeCliente: string;
  status: "importado" | "erro_importacao" | "conciliado" | "nao_encontrado_judit" | "erro_judit";
  erro?: string;
  statusJudit?: string;
}

interface ImportJob {
  id: number;
  nomeArquivo: string | null;
  totalLinhas: number;
  linhasImportadas: number;
  linhasErro: number;
  linhasConciliadas: number;
  linhasNaoEncontradas: number;
  status: "importando" | "conciliando" | "concluido" | "erro";
  detalhes: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function statusBadge(status: DetalheImportacao["status"]) {
  switch (status) {
    case "importado":
      return <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 text-xs">Aguardando Judit</Badge>;
    case "conciliado":
      return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">Conciliado</Badge>;
    case "nao_encontrado_judit":
      return <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50 text-xs">Não encontrado</Badge>;
    case "erro_importacao":
      return <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 text-xs">Erro importação</Badge>;
    case "erro_judit":
      return <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50 text-xs">Erro Judit</Badge>;
  }
}

function jobStatusLabel(status: ImportJob["status"]) {
  switch (status) {
    case "importando": return "Importando planilha...";
    case "conciliando": return "Conciliando com Judit...";
    case "concluido": return "Concluído";
    case "erro": return "Erro";
  }
}

// ─── Componente de progresso do job ────────────────────────────────────────
function JobProgressCard({ jobId, onConcluido }: { jobId: number; onConcluido: (job: ImportJob) => void }) {
  const [concluido, setConcluido] = useState(false);

  const { data: job } = trpc.admin.importJobStatus.useQuery(
    { jobId },
    {
      refetchInterval: concluido ? false : 3000,
      enabled: !concluido,
    }
  );

  useEffect(() => {
    if (job?.status === "concluido" || job?.status === "erro") {
      setConcluido(true);
      onConcluido(job as ImportJob);
    }
  }, [job?.status]);

  if (!job) return null;

  const totalConciliacao = job.linhasImportadas;
  const progresso = totalConciliacao > 0
    ? Math.round(((job.linhasConciliadas + job.linhasNaoEncontradas) / totalConciliacao) * 100)
    : 0;

  return (
    <Card className="shadow-sm border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {job.status === "concluido" ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <RefreshCw className="w-4 h-4 text-primary animate-spin" />
          )}
          {jobStatusLabel(job.status as ImportJob["status"])}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-background rounded-lg border">
            <p className="text-lg font-bold">{job.totalLinhas}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-lg font-bold text-blue-700">{job.linhasImportadas}</p>
            <p className="text-xs text-blue-600">Importados</p>
          </div>
          <div className="p-2 bg-green-50 rounded-lg border border-green-100">
            <p className="text-lg font-bold text-green-700">{job.linhasConciliadas}</p>
            <p className="text-xs text-green-600">Conciliados</p>
          </div>
          <div className="p-2 bg-yellow-50 rounded-lg border border-yellow-100">
            <p className="text-lg font-bold text-yellow-700">{job.linhasNaoEncontradas}</p>
            <p className="text-xs text-yellow-600">Não encontrados</p>
          </div>
        </div>

        {job.status === "conciliando" && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Conciliando com Judit...</span>
              <span>{progresso}%</span>
            </div>
            <Progress value={progresso} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────
export default function AdminImportacaoSimples() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobConcluido, setJobConcluido] = useState<ImportJob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const modeloQuery = trpc.admin.gerarPlanilhaModeloSimples.useQuery(undefined, { enabled: false });

  const importarMutation = trpc.admin.importarPlanilhaSimples.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success(`${data.linhasOk} processo(s) importado(s). Conciliando com Judit em background...`);
    },
    onError: (err) => {
      toast.error(`Erro ao importar: ${err.message}`);
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      setArquivo(file);
      setJobId(null);
      setJobConcluido(null);
    } else {
      toast.error("Formato inválido. Use .xlsx, .xls ou .csv");
    }
  }, []);

  const handleImportar = async () => {
    if (!arquivo) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      if (!base64) return;
      setJobId(null);
      setJobConcluido(null);
      importarMutation.mutate({ fileBase64: base64, nomeArquivo: arquivo.name });
    };
    reader.readAsDataURL(arquivo);
  };

  const handleBaixarModelo = async () => {
    const result = await modeloQuery.refetch();
    if (result.data) {
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data.base64}`;
      link.download = result.data.filename;
      link.click();
    }
  };

  const handleConcluido = (job: ImportJob) => {
    setJobConcluido(job);
    utils.admin.listarImportJobs.invalidate();
    toast.success("Conciliação com Judit concluída!");
  };

  const detalhesFinais = jobConcluido
    ? (jobConcluido.detalhes as DetalheImportacao[]) ?? []
    : [];

  return (
    <div className="space-y-4">
      {/* Card de upload */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              Importar Processos via Planilha
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleBaixarModelo} className="text-xs gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Baixar modelo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instrução de colunas */}
          <Alert className="border-blue-200 bg-blue-50/50">
            <AlertDescription className="text-xs text-blue-800">
              <p className="font-semibold mb-1.5">Colunas esperadas na planilha:</p>
              <div className="flex flex-wrap gap-1.5">
                {["cnj", "nome_cliente", "advogado", "escritorio"].map((col) => (
                  <code key={col} className="bg-blue-100 px-2 py-0.5 rounded font-mono text-blue-900">
                    {col}
                  </code>
                ))}
              </div>
              <p className="mt-2 text-blue-700">
                Apenas <strong>cnj</strong> é obrigatório. Após a importação, cada processo será consultado automaticamente na API Judit.
              </p>
            </AlertDescription>
          </Alert>

          {/* Área de drag-and-drop */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-primary bg-primary/10 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-primary/5"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <FileSpreadsheet className={`w-12 h-12 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            {arquivo ? (
              <div>
                <p className="font-semibold text-foreground">{arquivo.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{(arquivo.size / 1024).toFixed(1)} KB</p>
                <p className="text-xs text-primary mt-2">Clique para trocar o arquivo</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-foreground">Arraste o arquivo aqui ou clique para selecionar</p>
                <p className="text-sm text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls, .csv</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setJobId(null);
                setJobConcluido(null);
              }}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleImportar}
            disabled={!arquivo || importarMutation.isPending}
          >
            {importarMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Importar e conciliar com Judit
              </span>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Progresso em tempo real */}
      {jobId && !jobConcluido && (
        <JobProgressCard jobId={jobId} onConcluido={handleConcluido} />
      )}

      {/* Relatório final */}
      {jobConcluido && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-green-600" />
              Relatório Final da Importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="p-3 bg-muted/30 rounded-lg border">
                <p className="text-xl font-bold">{jobConcluido.totalLinhas}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xl font-bold text-blue-700">{jobConcluido.linhasImportadas}</p>
                <p className="text-xs text-blue-600">Importados</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                <p className="text-xl font-bold text-green-700">{jobConcluido.linhasConciliadas}</p>
                <p className="text-xs text-green-600">Conciliados</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                <p className="text-xl font-bold text-yellow-700">{jobConcluido.linhasNaoEncontradas}</p>
                <p className="text-xs text-yellow-600">Não encontrados</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <p className="text-xl font-bold text-red-700">{jobConcluido.linhasErro}</p>
                <p className="text-xs text-red-600">Erros</p>
              </div>
            </div>

            {/* Tabela de detalhes */}
            {detalhesFinais.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Detalhes por processo
                </p>
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs w-12">#</TableHead>
                          <TableHead className="text-xs">CNJ</TableHead>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Detalhe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detalhesFinais.map((d, i) => (
                          <TableRow key={i} className="text-xs">
                            <TableCell className="text-muted-foreground">{d.linha}</TableCell>
                            <TableCell className="font-mono text-xs">{d.cnj || "—"}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{d.nomeCliente || "—"}</TableCell>
                            <TableCell>{statusBadge(d.status)}</TableCell>
                            <TableCell className="text-muted-foreground max-w-[200px] truncate">
                              {d.erro ?? d.statusJudit ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                setArquivo(null);
                setJobId(null);
                setJobConcluido(null);
              }}
            >
              <Upload className="w-4 h-4" />
              Importar nova planilha
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Histórico de importações */}
      <HistoricoImportacoes />
    </div>
  );
}

// ─── Histórico de importações ───────────────────────────────────────────────
function HistoricoImportacoes() {
  const { data: jobs, isLoading } = trpc.admin.listarImportJobs.useQuery();

  if (isLoading) return null;
  if (!jobs || jobs.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Histórico de Importações
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Arquivo</TableHead>
                <TableHead className="text-xs text-center">Total</TableHead>
                <TableHead className="text-xs text-center">Importados</TableHead>
                <TableHead className="text-xs text-center">Conciliados</TableHead>
                <TableHead className="text-xs text-center">Não encontrados</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id} className="text-xs">
                  <TableCell className="max-w-[150px] truncate font-medium">
                    {job.nomeArquivo ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">{job.totalLinhas}</TableCell>
                  <TableCell className="text-center text-blue-700">{job.linhasImportadas}</TableCell>
                  <TableCell className="text-center text-green-700">{job.linhasConciliadas}</TableCell>
                  <TableCell className="text-center text-yellow-700">{job.linhasNaoEncontradas}</TableCell>
                  <TableCell>
                    {job.status === "concluido" ? (
                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">Concluído</Badge>
                    ) : job.status === "conciliando" ? (
                      <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 text-xs">Conciliando</Badge>
                    ) : job.status === "erro" ? (
                      <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 text-xs">Erro</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Importando</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
