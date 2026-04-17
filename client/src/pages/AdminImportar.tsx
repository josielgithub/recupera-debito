import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Info,
  Clock,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type ResultadoImportacao = {
  totalLinhas: number;
  importadas: number;
  atualizadas: number;
  erros: number;
  detalhes: { linha: number; cnj: string; status: string; erro?: string }[];
};

export default function AdminImportar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");

  const modeloQuery = trpc.admin.gerarModeloImportacao.useQuery(undefined, { enabled: false });
  const historicoQuery = trpc.admin.historicoImportacoesUnificado.useQuery();
  const importarMutation = trpc.admin.importarProcessos.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      historicoQuery.refetch();
      toast.success(`Importação concluída: ${data.importadas} novos, ${data.atualizadas} atualizados, ${data.erros} erros`);
    },
    onError: (err) => {
      toast.error(`Erro na importação: ${err.message}`);
    },
  });

  const processarArquivo = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Formato inválido. Use .xlsx, .xls ou .csv");
      return;
    }
    setNomeArquivo(file.name);
    setResultado(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      if (!base64) { toast.error("Erro ao ler arquivo"); return; }
      importarMutation.mutate({ fileBase64: base64, nomeArquivo: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processarArquivo(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processarArquivo(file);
  };

  const baixarModelo = async () => {
    try {
      const data = await modeloQuery.refetch();
      if (!data.data) return;
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.data.fileBase64}`;
      link.download = data.data.nomeArquivo;
      link.click();
      toast.success("Modelo baixado com sucesso");
    } catch {
      toast.error("Erro ao baixar modelo");
    }
  };

  const statusBadge = (status: string) => {
    if (status === "importado") return <Badge className="bg-green-100 text-green-800">Importado</Badge>;
    if (status === "atualizado") return <Badge className="bg-blue-100 text-blue-800">Atualizado</Badge>;
    if (status === "erro") return <Badge variant="destructive">Erro</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Importar Processos</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Importe processos em lote via planilha. Os processos entram na fila de aprovação Judit automaticamente.
          </p>
        </div>
        <Button variant="outline" onClick={baixarModelo} disabled={modeloQuery.isFetching}>
          <Download className="h-4 w-4 mr-2" />
          Baixar Modelo
        </Button>
      </div>

      {/* Aviso informativo */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Como funciona:</strong> A planilha importa processos sem acionar a Judit automaticamente.
          Após a importação, vá até a aba <strong>Fila Judit</strong> para aprovar quais processos devem ser consultados.
          O modelo contém duas abas: <em>Processos</em> (para preencher) e <em>Advogados</em> (lista de advogados cadastrados para referência).
        </div>
      </div>

      {/* Área de upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload da Planilha</CardTitle>
          <CardDescription>Formatos aceitos: .xlsx, .xls, .csv — Colunas: cnj, cpf, nome_cliente, advogado_email</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {importarMutation.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCcw className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm font-medium">Processando {nomeArquivo}...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Arraste a planilha aqui ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls ou .csv</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resultado da importação */}
      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Resultado: {nomeArquivo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{resultado.totalLinhas}</p>
                <p className="text-xs text-muted-foreground">Total de linhas</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-700">{resultado.importadas}</p>
                <p className="text-xs text-green-600">Novos processos</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-700">{resultado.atualizadas}</p>
                <p className="text-xs text-blue-600">Atualizados</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-700">{resultado.erros}</p>
                <p className="text-xs text-red-600">Erros</p>
              </div>
            </div>

            {resultado.detalhes.length > 0 && (
              <Accordion type="single" collapsible>
                <AccordionItem value="detalhes">
                  <AccordionTrigger className="text-sm">
                    Ver detalhes linha a linha ({resultado.detalhes.length} registros)
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Linha</TableHead>
                            <TableHead>CNJ</TableHead>
                            <TableHead className="w-28">Status</TableHead>
                            <TableHead>Detalhe</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultado.detalhes.map((d, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-muted-foreground">{d.linha}</TableCell>
                              <TableCell className="font-mono text-xs">{d.cnj}</TableCell>
                              <TableCell>{statusBadge(d.status)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{d.erro ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

      {/* Histórico de importações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Histórico de Importações
          </CardTitle>
          <CardDescription>Últimas 20 importações realizadas</CardDescription>
        </CardHeader>
        <CardContent>
          {historicoQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !historicoQuery.data?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma importação realizada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Importados</TableHead>
                  <TableHead className="text-right">Atualizados</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicoQuery.data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-sm">{log.nomeArquivo ?? "—"}</TableCell>
                    <TableCell className="text-right">{log.totalLinhas}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1 text-green-700">
                        <CheckCircle2 className="h-3 w-3" />
                        {log.linhasImportadas}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-blue-700">{log.linhasAtualizadas}</TableCell>
                    <TableCell className="text-right">
                      {log.linhasErro > 0 ? (
                        <span className="flex items-center justify-end gap-1 text-red-700">
                          <XCircle className="h-3 w-3" />
                          {log.linhasErro}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
