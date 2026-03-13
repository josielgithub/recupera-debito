import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
  Building2,
  User,
  RefreshCcw,
  Database,
} from "lucide-react";
import { toast } from "sonner";

// ─── Painel de Status da Conexão ──────────────────────────────────────────────
function PainelStatusConexao() {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; erro?: string; detalhes?: unknown } | null>(null);

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
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Consulta Processos</p>
            <p className="text-xs font-mono truncate">api.capturaweb.com.br/v1</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Monitoramento PUSH</p>
            <p className="text-xs font-mono truncate">api.push.codilo.com.br/v1</p>
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
              {resultado.ok
                ? `Conexão OK — Token obtido com sucesso${
                    resultado.detalhes && typeof resultado.detalhes === "object" && "totalRequests" in (resultado.detalhes as Record<string, unknown>)
                      ? ` (${(resultado.detalhes as { totalRequests: number }).totalRequests} requisições na conta)`
                      : ""
                  }`
                : resultado.erro}
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
  const [atualizarViaCodilo, setAtualizarViaCodilo] = useState(false);

  const consultar = trpc.admin.codiloConsultarDocumento.useMutation();

  const STATUS_LABELS: Record<string, string> = {
    em_analise_inicial: "Em análise inicial",
    protocolado: "Protocolado",
    em_andamento: "Em andamento",
    aguardando_audiencia: "Aguardando audiência",
    aguardando_sentenca: "Aguardando sentença",
    em_recurso: "Em recurso",
    cumprimento_de_sentenca: "Cumprimento de sentença",
    concluido_ganho: "Concluído – ganho",
    concluido_perdido: "Concluído – perdido",
    aguardando_documentos: "Aguardando documentos",
    acordo_negociacao: "Acordo/negociação",
    arquivado_encerrado: "Arquivado/encerrado",
  };

  const handleConsultar = async () => {
    if (!documento.trim()) {
      toast.error("Informe o documento para consultar");
      return;
    }
    try {
      const res = await consultar.mutateAsync({ documento: documento.trim(), tipo, atualizarViaCodilo });
      if (res?.ok) {
        const total = res.resultado?.total ?? 0;
        if (total === 0) {
          toast.info("Nenhum processo encontrado para este CPF no banco de dados");
        } else {
          toast.success(`${total} processo(s) encontrado(s)${
            atualizarViaCodilo ? " — atualização via Codilo disparada em background" : ""
          }`);
        }
      } else {
        toast.error(`Erro na consulta: ${res?.erro ?? "Resposta inválida"}`);
      }
    } catch (err) {
      toast.error(`Erro na consulta: ${String(err)}`);
    }
  };

  const resultadoConsulta = consultar.data;
  const resultado = resultadoConsulta?.resultado;

  type ProcessoLocal = {
    cnj: string;
    statusResumido: string;
    statusInterno?: string | null;
    advogado?: string | null;
    monitoramentoAtivo: boolean;
    ultimaAtualizacaoApi?: Date | null;
    semAtualizacao7dias: boolean;
    parceiro?: { nome: string; whatsapp?: string | null; email?: string | null } | null;
  };

  const processos: ProcessoLocal[] = Array.isArray(resultado?.processos)
    ? (resultado!.processos as ProcessoLocal[])
    : [];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          Consultar Processos por CPF
        </CardTitle>
        <CardDescription className="text-xs">
          Busca processos no banco de dados local por CPF. Para CNPJ ou nome, consulta diretamente a API Codilo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aviso informativo sobre a busca por CPF */}
        {tipo === "cpf" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex gap-2">
            <Database className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Busca no banco local:</strong> A API Codilo não suporta busca por CPF diretamente.
              A consulta por CPF busca no banco de dados interno os processos já importados.
              Use a opção abaixo para disparar atualização via Codilo após encontrar os processos.
            </div>
          </div>
        )}

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
              {tipo === "cpf" ? "CPF" : tipo === "cnpj" ? "CNPJ" : "Nome completo"}
            </Label>
            <Input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder={tipo === "cpf" ? "000.000.000-00 ou somente dígitos" : tipo === "cnpj" ? "00.000.000/0000-00" : "Maria da Silva"}
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

        {/* Opção de atualizar via Codilo (apenas para CPF) */}
        {tipo === "cpf" && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Switch
              id="atualizar-codilo"
              checked={atualizarViaCodilo}
              onCheckedChange={setAtualizarViaCodilo}
            />
            <div>
              <Label htmlFor="atualizar-codilo" className="text-xs font-medium cursor-pointer">
                Disparar atualização via Codilo após consultar
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Cria autorequests na Codilo para cada processo encontrado (processamento em background)
              </p>
            </div>
          </div>
        )}

        {resultadoConsulta && (
          <div>
            <Separator className="my-3" />
            {!resultadoConsulta.ok ? (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <XCircle className="w-4 h-4" />
                <span>{resultadoConsulta.erro ?? "Erro desconhecido"}</span>
              </div>
            ) : processos.length === 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>Nenhum processo encontrado para este {tipo === "cpf" ? "CPF no banco de dados" : "documento"}.</span>
                </div>
                {tipo === "cpf" && (
                  <p className="text-xs text-muted-foreground">
                    Verifique se o CPF está cadastrado e se há processos importados para este cliente.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Informações do cliente */}
                {resultado?.cliente && (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                    <User className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{resultado.cliente.nome}</p>
                      <p className="text-xs text-muted-foreground">{resultado.cliente.cpf}</p>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {processos.length} processo(s)
                    </Badge>
                  </div>
                )}

                {/* Aviso de atualização disparada */}
                {resultado?.atualizacaoInfo && (
                  <div className="flex items-center gap-2 text-xs text-green-700 rounded-lg border border-green-200 bg-green-50 p-2">
                    <RefreshCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>{resultado.atualizacaoInfo}</span>
                  </div>
                )}

                {/* Lista de processos */}
                <p className="text-xs text-muted-foreground font-medium">
                  {resultado?.fonte === "banco_local" ? "Processos no banco de dados:" : "Processos na Codilo:"}
                </p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {processos.map((p, i) => (
                    <div key={i} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-[11px]">{p.cnj}</span>
                        <Badge
                          variant={p.statusResumido === "concluido_ganho" ? "default" : p.statusResumido === "concluido_perdido" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {STATUS_LABELS[p.statusResumido] ?? p.statusResumido}
                        </Badge>
                      </div>
                      {p.statusInterno && (
                        <p className="text-muted-foreground text-[10px]">Status interno: {p.statusInterno}</p>
                      )}
                      {p.parceiro && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {p.parceiro.nome}
                          {p.parceiro.whatsapp ? ` • ${p.parceiro.whatsapp}` : ""}
                        </p>
                      )}
                      {p.advogado && (
                        <p className="text-muted-foreground">Adv: {p.advogado}</p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        {p.ultimaAtualizacaoApi && (
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(p.ultimaAtualizacaoApi).toLocaleString("pt-BR")}
                          </p>
                        )}
                        {p.monitoramentoAtivo && (
                          <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">• Monitorado</Badge>
                        )}
                        {p.semAtualizacao7dias && (
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">⚠ Sem atualização 7d</Badge>
                        )}
                      </div>
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

// ─── Atualização Manual de Processos ────────────────────────────────────────────────────
function PainelAtualizacaoProcessos() {
  const atualizar = trpc.admin.codiloAtualizarProcessos.useMutation();
  const disparar  = trpc.admin.codiloDispararBackground.useMutation();
  const coletar   = trpc.admin.codiloColetarResultados.useMutation();

  const handleAtualizar = async () => {
    toast.info("Iniciando atualização com polling... Aguarde (pode levar minutos).");
    try {
      await atualizar.mutateAsync();
      toast.success("Atualização concluída!");
    } catch (err) {
      toast.error("Erro na atualização: " + String(err));
    }
  };

  const handleDisparar = async () => {
    try {
      const res = await disparar.mutateAsync();
      toast.success(res.mensagem);
    } catch (err) {
      toast.error("Erro ao disparar: " + String(err));
    }
  };

  const handleColetar = async () => {
    try {
      const res = await coletar.mutateAsync();
      toast.success(res.mensagem);
    } catch (err) {
      toast.error("Erro ao coletar: " + String(err));
    }
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
          A Codilo processa requisições de forma <strong>assíncrona</strong>: ao solicitar uma consulta, a API cria uma requisição pendente e processa em segundo plano. O resultado pode levar de segundos a minutos dependendo do tribunal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerta explicativo */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p><strong>Fluxo recomendado em 2 etapas:</strong></p>
            <p><strong>1º</strong> Clique em <strong>Disparar em Background</strong> — cria as requisições na Codilo e retorna imediatamente.</p>
            <p><strong>2º</strong> Após ~3 minutos, clique em <strong>Coletar Resultados</strong> — busca os resultados já processados e atualiza o banco.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleDisparar}
            disabled={atualizar.isPending || disparar.isPending || coletar.isPending}
            className="gap-2"
            size="sm"
            variant="default"
          >
            {disparar.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {disparar.isPending ? "Disparando..." : "1º Disparar em Background"}
          </Button>

          <Button
            onClick={handleColetar}
            disabled={atualizar.isPending || disparar.isPending || coletar.isPending}
            className="gap-2"
            size="sm"
            variant="outline"
          >
            {coletar.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {coletar.isPending ? "Coletando..." : "2º Coletar Resultados"}
          </Button>

          <Button
            onClick={handleAtualizar}
            disabled={atualizar.isPending || disparar.isPending || coletar.isPending}
            className="gap-2"
            size="sm"
            variant="ghost"
          >
            {atualizar.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {atualizar.isPending ? "Aguardando..." : "Atualizar com Polling (lento)"}
          </Button>
        </div>

        {coletar.data && (
          <div className="flex items-center gap-2 text-xs text-green-700 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{coletar.data.mensagem}</span>
          </div>
        )}

        {disparar.data && (
          <div className="flex items-center gap-2 text-xs text-green-700 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{disparar.data.mensagem}</span>
          </div>
        )}

        {atualizar.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Consultando a API Codilo com polling. Aguarde até 25 segundos por processo...
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
