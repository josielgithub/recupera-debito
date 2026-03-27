import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  RefreshCw,
  Play,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  Zap,
  Database,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const label = STATUS_RESUMIDO_LABELS[status] ?? status;
  const cor = STATUS_CORES[status] ?? "bg-gray-100 text-gray-800";
  return <Badge className={`${cor} border-0 text-xs whitespace-nowrap`}>{label}</Badge>;
}

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

// ─── Painel: Status Geral ─────────────────────────────────────────────────────
function PainelStatus() {
  const { data, isLoading, refetch } = trpc.admin.juditStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Status das Requisições Judit
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : data?.ok ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{data.counts.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{data.counts.processing}</p>
              <p className="text-xs text-blue-600/70 mt-0.5 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" /> Processando
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{data.counts.completed}</p>
              <p className="text-xs text-green-600/70 mt-0.5 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Concluídas
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{data.counts.error}</p>
              <p className="text-xs text-red-600/70 mt-0.5 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" /> Erros
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-destructive">Erro ao carregar status.</p>
        )}

        <div className="mt-4 p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Como funciona a integração Judit:</p>
          <p>1. <strong>Disparar em Background</strong> — cria requisições na Judit para todos os processos desatualizados (não bloqueante).</p>
          <p>2. <strong>Coletar Resultados</strong> — verifica o status das requisições pendentes e atualiza o banco com os dados retornados.</p>
          <p>3. <strong>Rotina automática</strong> — o servidor executa as etapas 1 e 2 automaticamente a cada 6 horas.</p>
          <p>4. <strong>Webhook</strong> — configure <code className="bg-muted px-1 rounded">POST /api/judit/callback</code> na Judit para receber atualizações em tempo real.</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Painel: Atualização em Background ───────────────────────────────────────
function PainelBackground() {
  const disparar = trpc.admin.juditDispararBackground.useMutation({
    onSuccess: (data) => {
      toast.success(data.mensagem);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const coletar = trpc.admin.juditColetarResultados.useMutation({
    onSuccess: (data) => {
      toast.success(data.mensagem);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Atualização em Lote
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Disparar */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">1º Disparar em Background</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cria requisições na Judit para todos os processos sem atualização recente.
                Retorna imediatamente — o processamento ocorre nos servidores da Judit.
              </p>
            </div>
            <Button
              onClick={() => disparar.mutate()}
              disabled={disparar.isPending}
              className="w-full"
              size="sm"
            >
              {disparar.isPending ? (
                <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> Disparando...</>
              ) : (
                <><Play className="w-3.5 h-3.5 mr-2" /> Disparar em Background</>
              )}
            </Button>
          </div>

          {/* Coletar */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">2º Coletar Resultados</p>
              <p className="text-xs text-muted-foreground mt-1">
                Verifica as requisições pendentes e atualiza o banco com os resultados disponíveis.
                Use após aguardar alguns minutos do disparo.
              </p>
            </div>
            <Button
              onClick={() => coletar.mutate()}
              disabled={coletar.isPending}
              variant="outline"
              className="w-full"
              size="sm"
            >
              {coletar.isPending ? (
                <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> Coletando...</>
              ) : (
                <><Download className="w-3.5 h-3.5 mr-2" /> Coletar Resultados</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Painel: Consulta por CPF ─────────────────────────────────────────────────
function PainelConsultaCpf() {
  const [cpf, setCpf] = useState("");
  const [atualizar, setAtualizar] = useState(false);
  const [resultado, setResultado] = useState<{
    processos: Array<{
      cnj: string;
      statusResumido: string;
      statusOriginal: string | null;
      advogado: string | null;
      ultimaAtualizacaoApi: Date | string | null;
      semAtualizacao7dias: boolean;
      parceiro: { nome: string; whatsapp: string | null; email: string | null } | null;
    }>;
    total: number;
    cliente: { nome: string; cpf: string } | null;
    atualizacaoInfo: string | null;
  } | null>(null);

  const consultar = trpc.admin.juditConsultarCpf.useMutation({
    onSuccess: (data) => {
      if (data.ok && data.resultado) {
        setResultado({
          ...data.resultado,
          atualizacaoInfo: data.resultado.atualizacaoInfo ?? null,
        });
        if (data.resultado.total === 0) {
          toast.info("Nenhum processo encontrado para este CPF.");
        } else {
          toast.success(`${data.resultado.total} processo(s) encontrado(s).`);
        }
        if (data.resultado.atualizacaoInfo) {
          toast.info(data.resultado.atualizacaoInfo);
        }
      } else {
        toast.error(data.erro ?? "Erro desconhecido");
      }
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  function handleConsultar() {
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      toast.error("CPF inválido. Informe 11 dígitos.");
      return;
    }
    setResultado(null);
    consultar.mutate({ cpf: cpfLimpo, atualizarViaJudit: atualizar });
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          Consultar Processos por CPF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="CPF do cliente (somente números)"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            className="max-w-xs text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleConsultar()}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={atualizar}
              onChange={(e) => setAtualizar(e.target.checked)}
              className="rounded"
            />
            Disparar atualização via Judit
          </label>
          <Button
            onClick={handleConsultar}
            disabled={consultar.isPending}
            size="sm"
          >
            {consultar.isPending ? (
              <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> Buscando...</>
            ) : (
              <><Search className="w-3.5 h-3.5 mr-2" /> Buscar</>
            )}
          </Button>
        </div>

        {resultado && (
          <div className="space-y-3">
            {resultado.cliente && (
              <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                <Database className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{resultado.cliente.nome}</span>
                <span className="text-xs text-muted-foreground">CPF: {resultado.cliente.cpf}</span>
                <Badge variant="outline" className="text-xs ml-auto">{resultado.total} processo(s)</Badge>
              </div>
            )}

            {resultado.processos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum processo encontrado.</p>
            ) : (
              <div className="space-y-2">
                {resultado.processos.map((p) => (
                  <div key={p.cnj} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <code className="text-xs font-mono text-foreground">{p.cnj}</code>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.statusResumido} />
                        {p.semAtualizacao7dias && (
                          <Badge variant="destructive" className="text-xs">Sem atualização 7d</Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                      {p.statusOriginal && (
                        <span><strong>Status Judit:</strong> {p.statusOriginal}</span>
                      )}
                      {p.advogado && (
                        <span><strong>Advogado:</strong> {p.advogado}</span>
                      )}
                      {p.parceiro && (
                        <span><strong>Parceiro:</strong> {p.parceiro.nome}</span>
                      )}
                      <span><strong>Última atualização:</strong> {formatarData(p.ultimaAtualizacaoApi)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Painel: Consulta por CNJ ─────────────────────────────────────────────────
function PainelConsultaCnj() {
  const [cnj, setCnj] = useState("");
  const [resultado, setResultado] = useState<{
    atualizado: boolean;
    processo: {
      cnj: string;
      statusResumido: string;
      statusOriginal: string | null;
      ultimaAtualizacaoApi: Date | string | null;
    } | null;
  } | null>(null);

  const consultar = trpc.admin.juditConsultarCnj.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        setResultado({ atualizado: data.atualizado, processo: data.processo as typeof resultado extends null ? never : NonNullable<typeof resultado>["processo"] });
        if (data.atualizado) {
          toast.success("Processo atualizado com sucesso via Judit!");
        } else {
          toast.info("Requisição criada. O processo será atualizado quando a Judit processar.");
        }
      } else {
        toast.error(data.erro ?? "Erro desconhecido");
      }
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          Consultar e Atualizar por CNJ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Cria uma requisição na Judit para o CNJ informado e aguarda o resultado (polling de até 100 segundos).
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: 0000001-02.2023.8.26.0001"
            value={cnj}
            onChange={(e) => setCnj(e.target.value)}
            className="text-sm font-mono"
            onKeyDown={(e) => e.key === "Enter" && consultar.mutate({ cnj })}
          />
          <Button
            onClick={() => consultar.mutate({ cnj })}
            disabled={consultar.isPending || !cnj.trim()}
            size="sm"
          >
            {consultar.isPending ? (
              <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> Consultando...</>
            ) : (
              <><Zap className="w-3.5 h-3.5 mr-2" /> Consultar</>
            )}
          </Button>
        </div>

        {resultado && resultado.processo && (
          <div className="border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <code className="text-xs font-mono">{resultado.processo.cnj}</code>
              {resultado.atualizado ? (
                <Badge className="bg-green-100 text-green-800 border-0 text-xs">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Atualizado
                </Badge>
              ) : (
                <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">
                  <Clock className="w-3 h-3 mr-1" /> Pendente
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Status:</strong> <StatusBadge status={resultado.processo.statusResumido} /></p>
              {resultado.processo.statusOriginal && (
                <p><strong>Status Judit:</strong> {resultado.processo.statusOriginal}</p>
              )}
              <p><strong>Última atualização:</strong> {formatarData(resultado.processo.ultimaAtualizacaoApi)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function AdminJudit() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Integração Judit</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Gerencie a atualização automática de processos via API Judit.
          A rotina automática executa a cada 6 horas.
        </p>
      </div>

      <Separator />

      <PainelStatus />
      <PainelBackground />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PainelConsultaCpf />
        <PainelConsultaCnj />
      </div>
    </div>
  );
}
