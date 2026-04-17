import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, DollarSign, BarChart3, CheckCircle, LogOut } from "lucide-react";
import ImpersonacaoBanner from "@/components/ImpersonacaoBanner";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  em_analise_inicial: { label: "Em análise", color: "bg-yellow-100 text-yellow-800" },
  protocolado: { label: "Protocolado", color: "bg-blue-100 text-blue-800" },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-800" },
  aguardando_audiencia: { label: "Aguardando audiência", color: "bg-orange-100 text-orange-800" },
  aguardando_sentenca: { label: "Aguardando sentença", color: "bg-orange-100 text-orange-800" },
  em_recurso: { label: "Em recurso", color: "bg-purple-100 text-purple-800" },
  cumprimento_de_sentenca: { label: "Cumprimento de sentença", color: "bg-indigo-100 text-indigo-800" },
  concluido_ganho: { label: "Concluído (ganho)", color: "bg-green-100 text-green-800" },
  concluido_perdido: { label: "Concluído (perdido)", color: "bg-red-100 text-red-800" },
  arquivado_encerrado: { label: "Arquivado", color: "bg-gray-100 text-gray-800" },
  acordo_negociacao: { label: "Acordo/Negociação", color: "bg-teal-100 text-teal-800" },
};

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvestidorPortal() {
  const { user, loading: authLoading, logout } = useAuth();
  const [page, setPage] = useState(1);

  const { data: dadosInvestidor, isLoading: loadingDados } = trpc.investidor.meusDados.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });

  const { data: processosData, isLoading: loadingProcessos } = trpc.investidor.meusProcessos.useQuery(
    { page, pageSize: 50 },
    { enabled: !!user }
  );

  if (authLoading || loadingDados) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <TrendingUp className="h-12 w-12 text-green-600 mx-auto mb-2" />
            <CardTitle>Portal do Investidor</CardTitle>
            <CardDescription>Faça login para acessar seu portal.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => { window.location.href = getLoginUrl("/investidor"); }}>
              Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = dadosInvestidor?.metrics;

  return (
    <div className="min-h-screen bg-gray-50">
      <ImpersonacaoBanner />
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10" style={{ top: sessionStorage.getItem('impersonacao_token') ? '48px' : '0' }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-gray-900">Portal do Investidor</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Métricas financeiras */}
        {metrics && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-green-700 font-medium">Projeção Total</span>
                  </div>
                  <div className="text-xl font-bold text-green-800">
                    {formatCurrency(metrics.valorProjetado)}
                  </div>
                  <div className="text-xs text-green-600 mt-0.5">Baseado no seu percentual</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                    <span className="text-xs text-muted-foreground">Total em Disputa</span>
                  </div>
                  <div className="text-xl font-bold text-gray-900">
                    {formatCurrency(metrics.valorTotalDisputa)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Valor total dos processos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-blue-600">{metrics.emAndamento}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Em Andamento</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">{metrics.ganhos}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Processos Ganhos</div>
                </CardContent>
              </Card>
            </div>

            {/* Resumo geral */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-gray-900">{metrics.total}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Total de Processos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-500">{metrics.perdidos}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Processos Perdidos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-gray-900">
                    {metrics.total > 0 ? `${Math.round((metrics.ganhos / metrics.total) * 100)}%` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Taxa de Sucesso</div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Tabela de processos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Meus Processos</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {processosData?.total ?? 0} processo(s) nos seus lotes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProcessos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-green-600" />
              </div>
            ) : !processosData?.processos.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum processo nos seus lotes ainda.</p>
                <p className="text-xs mt-1">Entre em contato com o administrador para ser vinculado a um lote.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CNJ</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valor Obtido</TableHead>
                      <TableHead>Seu % no Lote</TableHead>
                      <TableHead>Sua Projeção</TableHead>
                      <TableHead>Cliente Pagou</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processosData.processos.map((p) => {
                      const statusInfo = STATUS_LABELS[p.statusResumido] ?? { label: p.statusResumido, color: "bg-gray-100 text-gray-800" };
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.cnj}</TableCell>
                          <TableCell className="text-sm">
                            <div>{p.clienteNome ?? "—"}</div>
                            {p.clienteCpf && <div className="text-xs text-muted-foreground">{p.clienteCpf}</div>}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.valorObtido ? formatCurrency(Number(p.valorObtido)) : "—"}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {p.percentual > 0 ? `${p.percentual}%` : "—"}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-green-700">
                            {p.valorProjetado > 0 ? formatCurrency(p.valorProjetado) : "—"}
                          </TableCell>
                          <TableCell>
                            {p.clientePago ? (
                              <div className="flex items-center gap-1 text-green-600 text-xs">
                                <CheckCircle className="h-3 w-3" />
                                {p.valorPagoCliente ? formatCurrency(Number(p.valorPagoCliente) * (p.percentual / 100)) : "Sim"}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Não</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Projeção total */}
                {processosData.projecaoTotal > 0 && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-800">Projeção Total desta Página</span>
                      <span className="text-lg font-bold text-green-800">{formatCurrency(processosData.projecaoTotal)}</span>
                    </div>
                  </div>
                )}

                {/* Paginação */}
                {processosData.total > 50 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-muted-foreground">
                      Página {page} de {Math.ceil(processosData.total / 50)}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        Anterior
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(processosData.total / 50)}>
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
