import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Info,
  Clock,
  User,
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
  const [advogadoSelecionado, setAdvogadoSelecionado] = useState<string>("");

  const modeloQuery = trpc.admin.gerarModeloImportacao.useQuery(undefined, { enabled: false });
  const historicoQuery = trpc.admin.historicoImportacoesUnificado.useQuery();
  const advogadosQuery = trpc.admin.listarAdvogadosUsuarios.useQuery();
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

  const advogadoIdNum = advogadoSelecionado === "sem_advogado"
    ? null
    : advogadoSelecionado
      ? parseInt(advogadoSelecionado, 10)
      : undefined;

  const podeImportar = advogadoSelecionado !== "";

  const processarArquivo = async (file: File) => {
    if (!podeImportar) {
      toast.error("Selecione um advogado responsável antes de importar");
      return;
    }
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
      importarMutation.mutate({
        fileBase64: base64,
        nomeArquivo: file.name,
        advogadoId: advogadoIdNum ?? null,
      });
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

  const advogadoNome = advogadoSelecionado === "sem_advogado"
    ? "Sem advogado"
    : advogadosQuery.data?.find(a => String(a.id) === advogadoSelecionado)?.name ?? "";

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
          O modelo contém apenas a aba <em>Processos</em> com as colunas obrigatórias: <strong>cnj</strong>, <strong>cpf</strong> e <strong>nome_cliente</strong>.
        </div>
      </div>

      {/* Seleção de advogado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Advogado responsável
          </CardTitle>
          <CardDescription>
            Selecione o advogado que será vinculado a todos os processos desta importação.
            Este campo é obrigatório para habilitar o upload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="advogado-select">
              Advogado responsável pelos processos desta importação <span className="text-destructive">*</span>
            </Label>
            <Select
              value={advogadoSelecionado}
              onValueChange={setAdvogadoSelecionado}
            >
              <SelectTrigger id="advogado-select" className="w-full">
                <SelectValue placeholder="Selecione um advogado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem_advogado">
                  <span className="text-muted-foreground italic">Sem advogado (definir depois)</span>
                </SelectItem>
                {advogadosQuery.isLoading && (
                  <SelectItem value="_loading" disabled>Carregando...</SelectItem>
                )}
                {advogadosQuery.data?.map((adv) => (
                  <SelectItem key={adv.id} value={String(adv.id)}>
                    {adv.name ?? adv.email ?? `ID ${adv.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!podeImportar && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Selecione um advogado para habilitar o upload da planilha.
              </p>
            )}
            {podeImportar && advogadoNome && (
              <p className="text-xs text-green-700 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Processos serão vinculados a: <strong>{advogadoNome}</strong>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Área de upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload da Planilha</CardTitle>
          <CardDescription>
            Formatos aceitos: .xlsx, .xls, .csv — Colunas obrigatórias:{" "}
            <Badge variant="secondary" className="text-xs mx-0.5">cnj</Badge>
            <Badge variant="secondary" className="text-xs mx-0.5">cpf</Badge>
            <Badge variant="secondary" className="text-xs mx-0.5">nome_cliente</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
              !podeImportar
                ? "border-muted-foreground/20 opacity-50 cursor-not-allowed"
                : dragging
                  ? "border-primary bg-primary/5 cursor-pointer"
                  : "border-muted-foreground/30 hover:border-primary/50 cursor-pointer"
            }`}
            onDragOver={(e) => { if (!podeImportar) return; e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { if (!podeImportar) return; handleDrop(e); }}
            onClick={() => { if (!podeImportar) { toast.error("Selecione um advogado antes de importar"); return; } fileInputRef.current?.click(); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
              disabled={!podeImportar}
            />
            {importarMutation.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCcw className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm font-medium">Processando {nomeArquivo}...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className={`h-10 w-10 ${podeImportar ? "text-muted-foreground" : "text-muted-foreground/40"}`} />
                <div>
                  <p className="font-medium">
                    {podeImportar
                      ? "Arraste a planilha aqui ou clique para selecionar"
                      : "Selecione um advogado acima para habilitar o upload"}
                  </p>
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
