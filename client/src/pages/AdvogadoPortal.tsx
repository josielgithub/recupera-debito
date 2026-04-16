import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Scale, FileText, CheckCircle, XCircle, Clock, TrendingUp, LogOut } from "lucide-react";
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

const STATUS_JUDIT_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  aguardando_aprovacao_judit: { label: "Aguardando consulta Judit", icon: <Clock className="h-3 w-3" /> },
  consultado: { label: "Consultado na Judit", icon: <CheckCircle className="h-3 w-3 text-green-600" /> },
  nao_encontrado: { label: "Não encontrado na Judit", icon: <XCircle className="h-3 w-3 text-red-600" /> },
};

function CadastrarProcessoDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [cnj, setCnj] = useState("");
  const [cpf, setCpf] = useState("");

  const cadastrar = trpc.advogado.cadastrarProcesso.useMutation({
    onSuccess: (data) => {
      toast.success(data.mensagem);
      setOpen(false);
      setCnj("");
      setCpf("");
      onSuccess();
    },
    onError: (err) => toast.error(err.message || "Erro ao cadastrar processo"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Cadastrar Processo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Processo</DialogTitle>
          <DialogDescription>
            Informe o número CNJ e o CPF do cliente. O administrador será notificado para consultar na Judit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cnj">Número CNJ</Label>
            <Input
              id="cnj"
              placeholder="0000000-00.0000.0.00.0000"
              value={cnj}
              onChange={(e) => setCnj(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF do Cliente</Label>
            <Input
              id="cpf"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => cadastrar.mutate({ cnj, cpfCliente: cpf })}
            disabled={!cnj.trim() || !cpf.trim() || cadastrar.isPending}
          >
            {cadastrar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarResultadoDialog({ processoId, onSuccess }: { processoId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [valorObtido, setValorObtido] = useState("");
  const [clientePago, setClientePago] = useState(false);
  const [dataPagamento, setDataPagamento] = useState("");
  const [valorPago, setValorPago] = useState("");

  const registrar = trpc.advogado.registrarResultado.useMutation({
    onSuccess: () => {
      toast.success("Resultado registrado com sucesso!");
      setOpen(false);
      onSuccess();
    },
    onError: (err) => toast.error(err.message || "Erro ao registrar resultado"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-3 w-3 mr-1" />
          Resultado
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Resultado</DialogTitle>
          <DialogDescription>Informe o resultado financeiro do processo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Valor Obtido (R$)</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={valorObtido}
              onChange={(e) => setValorObtido(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="clientePago"
              checked={clientePago}
              onChange={(e) => setClientePago(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="clientePago">Cliente já pagou</Label>
          </div>
          {clientePago && (
            <>
              <div className="space-y-1.5">
                <Label>Data do Pagamento</Label>
                <Input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor Pago pelo Cliente (R$)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={valorPago}
                  onChange={(e) => setValorPago(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => registrar.mutate({
              processoId,
              valorObtido: valorObtido ? parseFloat(valorObtido) : null,
              clientePago,
              dataPagamento: dataPagamento || null,
              valorPagoCliente: valorPago ? parseFloat(valorPago) : null,
            })}
            disabled={registrar.isPending}
          >
            {registrar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdvogadoPortal() {
  const { user, loading: authLoading, logout } = useAuth();
  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();

  const { data: dadosAdvogado, isLoading: loadingDados } = trpc.advogado.meusDados.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });

  const { data: processosData, isLoading: loadingProcessos } = trpc.advogado.meusProcessos.useQuery(
    { page, pageSize: 20 },
    { enabled: !!user }
  );

  const declinar = trpc.advogado.declinarProcesso.useMutation({
    onSuccess: () => {
      toast.success("Processo declinado.");
      utils.advogado.meusProcessos.invalidate();
      utils.advogado.meusDados.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao declinar processo"),
  });

  if (authLoading || loadingDados) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <Scale className="h-12 w-12 text-blue-600 mx-auto mb-2" />
            <CardTitle>Portal do Advogado</CardTitle>
            <CardDescription>Faça login para acessar seu portal.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => { window.location.href = getLoginUrl("/advogado"); }}>
              Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = dadosAdvogado?.metrics;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-gray-900">Portal do Advogado</span>
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
        {/* Métricas */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-gray-900">{metrics.total}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total de Processos</div>
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
                <div className="text-2xl font-bold text-yellow-600">{metrics.aguardandoJudit}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Aguardando Judit</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{metrics.concluidoGanho}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Concluídos (ganho)</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabela de processos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Meus Processos</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {processosData?.total ?? 0} processo(s) cadastrado(s)
              </CardDescription>
            </div>
            <CadastrarProcessoDialog onSuccess={() => {
              utils.advogado.meusProcessos.invalidate();
              utils.advogado.meusDados.invalidate();
            }} />
          </CardHeader>
          <CardContent>
            {loadingProcessos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : !processosData?.processos.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum processo cadastrado ainda.</p>
                <p className="text-xs mt-1">Clique em "Cadastrar Processo" para começar.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CNJ</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Judit</TableHead>
                      <TableHead>Valor Obtido</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processosData.processos.map((p) => {
                      const statusInfo = STATUS_LABELS[p.statusResumido] ?? { label: p.statusResumido, color: "bg-gray-100 text-gray-800" };
                      const juditInfo = STATUS_JUDIT_LABELS[p.statusJudit ?? "aguardando_aprovacao_judit"];
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
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {juditInfo?.icon}
                              {juditInfo?.label ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.valorObtido ? `R$ ${Number(p.valorObtido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <RegistrarResultadoDialog processoId={p.id} onSuccess={() => {
                                utils.advogado.meusProcessos.invalidate();
                              }} />
                              {p.statusResumido === "em_analise_inicial" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    if (confirm("Declinar este processo?")) {
                                      declinar.mutate({ processoId: p.id, motivo: null });
                                    }
                                  }}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Declinar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Paginação */}
                {processosData.total > 20 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-muted-foreground">
                      Página {page} de {Math.ceil(processosData.total / 20)}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        Anterior
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(processosData.total / 20)}>
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
