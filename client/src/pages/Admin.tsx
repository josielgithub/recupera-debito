import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Scale,
  LayoutDashboard,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  LogOut,
  RefreshCw,
  ChevronRight,
  Activity,
  TrendingUp,
  Users,
  FileText,
  AlertCircle,
  Download,
  Building2,
  Settings,
} from "lucide-react";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";
import { toast } from "sonner";
import AdminProcessos from "./AdminProcessos";
import AdminParceiros from "./AdminParceiros";
import AdminConfig from "./AdminConfig";
import { useRef } from "react";

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

const STATUS_ORDER = [
  "em_analise_inicial",
  "protocolado",
  "em_andamento",
  "aguardando_audiencia",
  "aguardando_sentenca",
  "em_recurso",
  "cumprimento_de_sentenca",
  "concluido_ganho",
  "concluido_perdido",
  "aguardando_documentos",
  "acordo_negociacao",
  "arquivado_encerrado",
];

const STATUS_ICON_COLORS: Record<string, string> = {
  em_analise_inicial: "text-blue-600 bg-blue-50",
  protocolado: "text-indigo-600 bg-indigo-50",
  em_andamento: "text-yellow-600 bg-yellow-50",
  aguardando_audiencia: "text-orange-600 bg-orange-50",
  aguardando_sentenca: "text-amber-600 bg-amber-50",
  em_recurso: "text-purple-600 bg-purple-50",
  cumprimento_de_sentenca: "text-teal-600 bg-teal-50",
  concluido_ganho: "text-green-600 bg-green-50",
  concluido_perdido: "text-red-600 bg-red-50",
  aguardando_documentos: "text-gray-600 bg-gray-50",
  acordo_negociacao: "text-cyan-600 bg-cyan-50",
  arquivado_encerrado: "text-slate-600 bg-slate-50",
};

// ─── Dashboard Principal ────────────────────────────────────────────────────
function DashboardView() {
  const { data, isLoading, refetch } = trpc.admin.dashboard.useQuery();
  const rotinaMutation = trpc.admin.rodarRotina7dias.useMutation({
    onSuccess: (r) => {
      toast.success(`Rotina executada: ${r.afetados} processo(s) marcado(s).`);
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const contagens = data?.contagens ?? {};
  const total = Object.values(contagens).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Resumo geral */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total de processos", value: total, icon: FileText, color: "text-primary bg-primary/10" },
          { label: "Concluídos – Ganho", value: contagens["concluido_ganho"] ?? 0, icon: CheckCircle2, color: "text-green-700 bg-green-50" },
          { label: "Em andamento", value: contagens["em_andamento"] ?? 0, icon: Activity, color: "text-yellow-700 bg-yellow-50" },
          { label: "Sem atualização 7d", value: data?.semAtualizacao?.length ?? 0, icon: AlertTriangle, color: "text-orange-700 bg-orange-50" },
        ].map((item) => (
          <Card key={item.label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{item.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cards por status */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Distribuição por status
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => rotinaMutation.mutate()}
              disabled={rotinaMutation.isPending}
              className="text-xs h-8"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${rotinaMutation.isPending ? "animate-spin" : ""}`} />
              Rotina 7 dias
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {STATUS_ORDER.map((status) => {
              const count = contagens[status] ?? 0;
              const label = STATUS_RESUMIDO_LABELS[status] ?? status;
              const iconColor = STATUS_ICON_COLORS[status] ?? "text-gray-600 bg-gray-50";
              return (
                <div
                  key={status}
                  className="flex items-center gap-2.5 p-3 rounded-lg border border-border/60 bg-card"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Listas filtradas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProcessosList
          titulo="Concluídos – Ganho"
          processos={data?.ganhos ?? []}
          icon={<CheckCircle2 className="w-4 h-4 text-green-600" />}
          emptyMsg="Nenhum processo ganho registrado."
        />
        <ProcessosList
          titulo="Cumprimento de sentença"
          processos={data?.cumprimentos ?? []}
          icon={<ChevronRight className="w-4 h-4 text-teal-600" />}
          emptyMsg="Nenhum processo em cumprimento."
        />
        <ProcessosList
          titulo="Concluídos – Perdido"
          processos={data?.perdidos ?? []}
          icon={<XCircle className="w-4 h-4 text-red-600" />}
          emptyMsg="Nenhum processo perdido registrado."
        />
        <ProcessosList
          titulo="Sem atualização há 7 dias"
          processos={data?.semAtualizacao ?? []}
          icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
          emptyMsg="Todos os processos estão atualizados."
          destaque
        />
      </div>
    </div>
  );
}

function ProcessosList({
  titulo,
  processos,
  icon,
  emptyMsg,
  destaque,
}: {
  titulo: string;
  processos: Array<{ cnj: string; statusResumido: string; updatedAt: Date | string }>;
  icon: React.ReactNode;
  emptyMsg: string;
  destaque?: boolean;
}) {
  return (
    <Card className={`shadow-sm ${destaque && processos.length > 0 ? "border-orange-200" : ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {titulo}
          <Badge variant="outline" className="ml-auto text-xs">{processos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {processos.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{emptyMsg}</p>
        ) : (
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {processos.slice(0, 20).map((p) => (
              <div
                key={p.cnj}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 text-xs"
              >
                <span className="font-mono text-muted-foreground truncate max-w-[150px]">{p.cnj}</span>
                <span className="text-muted-foreground ml-2 flex-shrink-0">{formatarData(p.updatedAt)}</span>
              </div>
            ))}
            {processos.length > 20 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                + {processos.length - 20} outros
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Importação de Planilha ─────────────────────────────────────────────────
function ImportacaoView() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<{
    totalLinhas: number;
    linhasOk: number;
    linhasErro: number;
    detalhes: Array<{ linha: number; status: string; cpf?: string; cnj?: string; erro?: string }>;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importarMutation = trpc.admin.importarPlanilha.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      toast.success(`Importação concluída: ${data.linhasOk} linha(s) importada(s).`);
    },
    onError: (err) => toast.error(`Erro na importação: ${err.message}`),
  });

  const { data: modelo } = trpc.admin.gerarPlanilhaModelo.useQuery();
  const { data: historico } = trpc.admin.historicoImportacoes.useQuery();

  function downloadModelo() {
    if (!modelo) return;
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${modelo.base64}`;
    link.download = modelo.filename;
    link.click();
  }

  async function handleImportar() {
    if (!arquivo) return;
    const buffer = await arquivo.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
    const base64 = btoa(binary);
    importarMutation.mutate({
      fileBase64: base64,
      nomeArquivo: arquivo.name,
      callbackBaseUrl: window.location.origin,
    });
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Importar planilha Excel
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={downloadModelo}
              disabled={!modelo}
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Baixar modelo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted/30 rounded-lg border border-border/40 text-xs">
            <p className="font-semibold text-foreground mb-2">Colunas esperadas na planilha:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
              {["cpf", "nome", "cnj", "status_interno", "advogado", "nome_escritorio", "whatsapp_escritorio", "email_escritorio"].map((col) => (
                <code key={col} className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
                  {col}
                </code>
              ))}
            </div>
            <p className="text-muted-foreground mt-2">
              Baixe o modelo acima para garantir o formato correto. Colunas obrigatórias: <strong>cpf</strong>, <strong>nome</strong>, <strong>cnj</strong>.
            </p>
          </div>

          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            {arquivo ? (
              <div>
                <p className="font-semibold text-foreground text-sm">{arquivo.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{(arquivo.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-foreground">Clique para selecionar o arquivo</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls, .csv</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setResultado(null);
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
                Processando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Importar planilha
              </span>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Resultado */}
      {resultado && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Relatório de importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{resultado.totalLinhas}</p>
                <p className="text-xs text-muted-foreground">Total de linhas</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-700">{resultado.linhasOk}</p>
                <p className="text-xs text-green-600">Importadas</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-700">{resultado.linhasErro}</p>
                <p className="text-xs text-red-600">Com erro</p>
              </div>
            </div>

            {resultado.detalhes.filter((d) => d.status === "erro").length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Linhas com erro
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {resultado.detalhes
                    .filter((d) => d.status === "erro")
                    .map((d) => (
                      <div key={d.linha} className="flex items-start gap-2 p-2 bg-red-50 rounded text-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong>Linha {d.linha}:</strong>{" "}
                          {d.cpf && <span className="text-muted-foreground">CPF {d.cpf} – </span>}
                          {d.erro}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {historico && historico.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Histórico de importações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Arquivo</TableHead>
                  <TableHead className="text-xs text-center">Total</TableHead>
                  <TableHead className="text-xs text-center">OK</TableHead>
                  <TableHead className="text-xs text-center">Erros</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs font-medium truncate max-w-[120px]">
                      {h.nomeArquivo ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-center">{h.totalLinhas}</TableCell>
                    <TableCell className="text-xs text-center text-green-700">{h.linhasOk}</TableCell>
                    <TableCell className="text-xs text-center text-red-700">{h.linhasErro}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatarData(h.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Logs de Consulta ───────────────────────────────────────────────────────
function LogsView() {
  const { data: logs } = trpc.admin.logsConsulta.useQuery({ limit: 100 });

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Logs de consulta pública
          <Badge variant="outline" className="ml-auto text-xs">{logs?.length ?? 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!logs || logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhuma consulta registrada ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">IP (hash)</TableHead>
                <TableHead className="text-xs">CPF (hash)</TableHead>
                <TableHead className="text-xs">Resultado</TableHead>
                <TableHead className="text-xs">Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {log.ipHash.slice(0, 12)}…
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {log.cpfHash.slice(0, 12)}…
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-xs border-0 ${
                        log.resultado === "encontrado"
                          ? "bg-green-100 text-green-800"
                          : log.resultado === "bloqueado"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {log.resultado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatarData(log.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página Admin Principal ─────────────────────────────────────────────────
export default function Admin() {
  const { user, loading, isAuthenticated, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="w-full max-w-sm shadow-2xl">
          <CardHeader className="text-center pb-4">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-3">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-lg">Área Administrativa</CardTitle>
            <p className="text-sm text-muted-foreground">Recupera Débito</p>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Acesso restrito. Faça login para continuar.
              </AlertDescription>
            </Alert>
            <Button
              className="w-full"
              onClick={() => (window.location.href = getLoginUrl())}
            >
              Entrar com Manus
            </Button>
            <Button variant="ghost" className="w-full mt-2 text-xs" asChild>
              <a href="/">← Voltar ao portal público</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-sm shadow-lg">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <p className="font-semibold text-foreground">Acesso negado</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sua conta não possui permissão de administrador.
              </p>
            </div>
            <Button variant="outline" onClick={() => logout()}>Sair</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header Admin */}
      <header className="bg-slate-900 text-white border-b border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Scale className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">Recupera Débito</p>
              <p className="text-xs text-slate-400">Dashboard Administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-slate-300" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">{user.name ?? user.email}</p>
                <p className="text-xs text-slate-400">Administrador</p>
              </div>
            </div>
            <Separator orientation="vertical" className="h-6 bg-slate-700 hidden sm:block" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="text-slate-300 hover:text-white hover:bg-slate-700 text-xs"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Sair
            </Button>
            <a href="/" className="text-xs text-slate-400 hover:text-white transition-colors hidden sm:block">
              ← Portal público
            </a>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <div className="container py-6">
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6 bg-white border border-border shadow-sm">
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5 text-xs">
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="processos" className="flex items-center gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" />
              Processos
            </TabsTrigger>
            <TabsTrigger value="parceiros" className="flex items-center gap-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5" />
              Escritórios
            </TabsTrigger>
            <TabsTrigger value="importacao" className="flex items-center gap-1.5 text-xs">
              <Upload className="w-3.5 h-3.5" />
              Importação
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1.5 text-xs">
              <Activity className="w-3.5 h-3.5" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-1.5 text-xs">
              <Settings className="w-3.5 h-3.5" />
              Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><DashboardView /></TabsContent>
          <TabsContent value="processos"><AdminProcessos /></TabsContent>
          <TabsContent value="parceiros"><AdminParceiros /></TabsContent>
          <TabsContent value="importacao"><ImportacaoView /></TabsContent>
          <TabsContent value="logs"><LogsView /></TabsContent>
          <TabsContent value="config"><AdminConfig /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
