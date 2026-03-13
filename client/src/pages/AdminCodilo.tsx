import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Zap,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Activity,
  FileText,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

// ─── Painel de Status da Conexão ──────────────────────────────────────────────
function PainelStatusConexao() {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; erro?: string } | null>(null);

  const testar = trpc.admin.codiloTestarConexao.useQuery(undefined, {
    enabled: false,
    refetchOnWindowFocus: false,
  });

  const handleTestar = async () => {
    setTestando(true);
    setResultado(null);
    try {
      const res = await testar.refetch();
      setResultado(res.data ?? { ok: false, erro: "Sem resposta" });
      if (res.data?.ok) {
        toast.success("Conexão com a Codilo estabelecida com sucesso!");
      } else {
        toast.error(`Falha na conexão: ${res.data?.erro}`);
      }
    } catch (err) {
      setResultado({ ok: false, erro: String(err) });
      toast.error("Erro ao testar conexão");
    } finally {
      setTestando(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Status da Integração Codilo
        </CardTitle>
        <CardDescription className="text-xs">
          Autenticação OAuth2 client_credentials — POST https://auth.codilo.com.br/oauth/token
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Endpoint Auth</p>
            <p className="text-xs font-mono truncate">auth.codilo.com.br</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Endpoint API</p>
            <p className="text-xs font-mono truncate">api.codilo.com.br</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Fluxo</p>
            <p className="text-xs font-mono">client_credentials</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleTestar}
            disabled={testando}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            {testando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {testando ? "Testando..." : "Testar Conexão"}
          </Button>

          {resultado && (
            <div className={`flex items-center gap-2 text-sm font-medium ${resultado.ok ? "text-green-600" : "text-red-600"}`}>
              {resultado.ok ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {resultado.ok ? "Conexão OK — Token obtido com sucesso" : resultado.erro}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold mb-0.5">Credenciais configuradas</p>
              <p>CODILO_API_KEY e CODILO_API_SECRET estão definidos via variáveis de ambiente seguras. O token é obtido automaticamente e renovado antes de expirar (margem de 60s). Em caso de erro 401, o token é invalidado e renovado na próxima requisição.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Consulta por Documento ───────────────────────────────────────────────────
function PainelConsultaDocumento() {
  const [documento, setDocumento] = useState("");
  const [tipo, setTipo] = useState<"cpf" | "cnpj" | "nome">("cpf");

  const consultar = trpc.admin.codiloConsultarDocumento.useMutation();

  const handleConsultar = async () => {
    if (!documento.trim()) {
      toast.error("Informe o documento para consultar");
      return;
    }
    await consultar.mutateAsync({ documento: documento.trim(), tipo });
    if (consultar.data?.ok) {
      toast.success("Consulta realizada com sucesso");
    } else {
      toast.error(`Erro na consulta: ${consultar.data?.erro}`);
    }
  };

  type ProcessoItem = {
    numero?: string; id?: string; status?: string;
    tribunal?: string; vara?: string; assunto?: string;
    dataUltimaAtualizacao?: string;
  };
  const processos: ProcessoItem[] = (
    (consultar.data?.resultado?.processos ?? consultar.data?.resultado?.data ?? []) as ProcessoItem[]
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          Consultar Processos na Codilo
        </CardTitle>
        <CardDescription className="text-xs">
          Busca processos diretamente na API Codilo por CPF, CNPJ ou nome
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-36">
            <Label className="text-xs mb-1.5 block">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "cpf" | "cnpj" | "nome")}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="nome">Nome</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-xs mb-1.5 block">
              {tipo === "cpf" ? "CPF (somente dígitos)" : tipo === "cnpj" ? "CNPJ (somente dígitos)" : "Nome completo"}
            </Label>
            <Input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder={tipo === "cpf" ? "52998224725" : tipo === "cnpj" ? "12345678000195" : "Maria da Silva"}
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleConsultar()}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleConsultar}
              disabled={consultar.isPending}
              size="sm"
              className="gap-2 h-9"
            >
              {consultar.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Consultar
            </Button>
          </div>
        </div>

        {consultar.data && (
          <div>
            <Separator className="my-3" />
            {!consultar.data.ok ? (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <XCircle className="w-4 h-4" />
                <span>{consultar.data.erro}</span>
              </div>
            ) : processos.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>Nenhum processo encontrado para este documento</span>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">
                  {processos.length} processo(s) encontrado(s) na Codilo:
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {processos.map((p, i) => (
                    <div key={i} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono font-semibold">{p.numero ?? p.id ?? "—"}</span>
                        {p.status && (
                          <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                        )}
                      </div>
                      {p.tribunal && <p className="text-muted-foreground">{p.tribunal}{p.vara ? ` — ${p.vara}` : ""}</p>}
                      {p.assunto && <p className="text-muted-foreground truncate">{p.assunto}</p>}
                      {p.dataUltimaAtualizacao && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(p.dataUltimaAtualizacao).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Atualização Manual de Processos ─────────────────────────────────────────
function PainelAtualizacaoProcessos() {
  const atualizar = trpc.admin.codiloAtualizarProcessos.useMutation();

  const handleAtualizar = async () => {
    toast.info("Iniciando atualização de processos via Codilo...");
    await atualizar.mutateAsync();
  };

  const res = atualizar.data;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          Atualização de Processos
        </CardTitle>
        <CardDescription className="text-xs">
          Consulta todos os processos do banco na API Codilo e atualiza os status divergentes. Processa em lotes de 5 com intervalo de 500ms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleAtualizar}
          disabled={atualizar.isPending}
          className="gap-2"
          size="sm"
        >
          {atualizar.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {atualizar.isPending ? "Atualizando processos..." : "Atualizar Todos os Processos"}
        </Button>

        {atualizar.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Consultando a API Codilo para cada processo. Isso pode levar alguns minutos dependendo do volume.
          </div>
        )}

        {res && (
          <div className="space-y-3">
            <Separator />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{res.total}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
              </div>
              <div className="rounded-lg border bg-green-50 border-green-100 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-green-700">{res.atualizados}</p>
                <p className="text-[10px] text-green-700 mt-0.5">Atualizados</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-muted-foreground">{res.semAlteracao}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Sem alteração</p>
              </div>
              <div className="rounded-lg border bg-red-50 border-red-100 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-red-700">{res.erros}</p>
                <p className="text-[10px] text-red-700 mt-0.5">Erros</p>
              </div>
            </div>

            {res.detalhes.filter((d) => d.statusAnterior !== d.statusNovo).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Processos com status alterado:</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {res.detalhes
                    .filter((d) => d.statusAnterior !== d.statusNovo)
                    .map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs rounded border bg-muted/20 px-3 py-2">
                        <span className="font-mono text-muted-foreground truncate flex-1">{d.cnj}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{d.statusAnterior}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge className="text-[10px] shrink-0 bg-green-100 text-green-800 border-green-200">{d.statusNovo}</Badge>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {res.detalhes.filter((d) => d.erro).length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-600 mb-2">Erros encontrados:</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {res.detalhes
                    .filter((d) => d.erro)
                    .map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs rounded border border-red-100 bg-red-50 px-3 py-2">
                        <XCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                        <span className="font-mono text-red-700 truncate">{d.cnj}</span>
                        <span className="text-red-600 truncate">{d.erro}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Documentação da Integração ───────────────────────────────────────────────
function PainelDocumentacao() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Arquitetura da Integração
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-foreground mb-1">Fluxo de Autenticação</p>
              <div className="rounded-lg bg-muted/40 p-3 font-mono space-y-1 text-[11px]">
                <p className="text-muted-foreground">POST /oauth/token</p>
                <p>{"{"}</p>
                <p className="pl-4">"grant_type": "client_credentials",</p>
                <p className="pl-4">"id": CODILO_API_KEY,</p>
                <p className="pl-4">"secret": CODILO_API_SECRET</p>
                <p>{"}"}</p>
                <p className="text-green-600">→ {"{ access_token, expires_in }"}</p>
              </div>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Estratégia de Cache</p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Token armazenado em memória até expirar</li>
                <li>Renovação automática com margem de 60s</li>
                <li>Invalidação e retry automático em erro 401</li>
                <li>Sem persistência em banco (segurança)</li>
              </ul>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-foreground mb-1">Funções Disponíveis</p>
              <div className="space-y-1.5">
                {[
                  { fn: "getCodiloToken()", desc: "Obtém/renova token OAuth2" },
                  { fn: "searchProcessByDocument(doc, tipo)", desc: "Consulta por CPF/CNPJ/nome" },
                  { fn: "getProcessoByCnjCodilo(cnj)", desc: "Busca processo específico" },
                  { fn: "updateProcessStatus(lista, cb)", desc: "Atualiza status em lote" },
                  { fn: "normalizarStatusCodilo(status)", desc: "Mapeia para 12 estados" },
                  { fn: "testarConexaoCodilo()", desc: "Verifica autenticação" },
                ].map((item) => (
                  <div key={item.fn} className="flex items-start gap-2">
                    <code className="text-[10px] bg-muted rounded px-1.5 py-0.5 font-mono text-primary shrink-0">{item.fn}</code>
                    <span className="text-muted-foreground">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Atualização Automática</p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Rotina agendada a cada 6 horas no servidor</li>
                <li>Lotes de 5 processos com delay de 500ms</li>
                <li>Erros isolados — não interrompem o lote</li>
                <li>Logs detalhados no console do servidor</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function AdminCodilo() {
  return (
    <div className="space-y-4">
      <PainelStatusConexao />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PainelConsultaDocumento />
        <PainelAtualizacaoProcessos />
      </div>
      <PainelDocumentacao />
    </div>
  );
}
