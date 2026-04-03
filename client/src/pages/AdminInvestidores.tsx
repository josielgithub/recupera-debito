import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, Users, Plus, Briefcase, CheckCircle, Scale, XCircle, Clock } from "lucide-react";

export default function AdminInvestidores() {
  const [novoNome, setNovoNome] = useState("");
  const [novoPercentual, setNovoPercentual] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: dashboard, isLoading, refetch } = trpc.admin.dashboardInvestidores.useQuery();

  const upsertMutation = trpc.admin.upsertInvestidor.useMutation({
    onSuccess: () => {
      toast.success("Investidor salvo com sucesso!");
      setNovoNome("");
      setNovoPercentual("");
      setDialogOpen(false);
      refetch();
    },
    onError: (err) => {
      toast.error("Erro ao salvar investidor", { description: err.message });
    },
  });

  const handleSalvar = () => {
    if (!novoNome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    upsertMutation.mutate({
      nome: novoNome.trim(),
      percentualParticipacao: novoPercentual ? parseFloat(novoPercentual) : null,
    });
  };

  const totalProcessos = dashboard?.reduce((acc, inv) => acc + inv.total, 0) ?? 0;
  const totalGanhos = dashboard?.reduce((acc, inv) => acc + inv.concluido_ganho, 0) ?? 0;
  const totalAndamento = dashboard?.reduce((acc, inv) => acc + inv.em_andamento, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investidores</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os investidores e visualize a distribuição de processos por carteira
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo Investidor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Investidor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="nome">Nome do Investidor *</Label>
                <Input
                  id="nome"
                  placeholder="Ex: João Silva"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="percentual">Percentual de Participação (%)</Label>
                <Input
                  id="percentual"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="Ex: 30.00"
                  value={novoPercentual}
                  onChange={(e) => setNovoPercentual(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSalvar} disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cards de resumo geral */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Processos</p>
              <p className="text-2xl font-bold">{totalProcessos}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Processos Ganhos</p>
              <p className="text-2xl font-bold">{totalGanhos}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Em Andamento</p>
              <p className="text-2xl font-bold">{totalAndamento}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de investidores */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : !dashboard || dashboard.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum investidor cadastrado ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em "Novo Investidor" para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {dashboard.map((inv) => {
            const taxaSucesso = inv.total > 0
              ? Math.round((inv.concluido_ganho / inv.total) * 100)
              : 0;

            return (
              <Card key={inv.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{inv.nome}</CardTitle>
                      {inv.percentualParticipacao && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Participação: {parseFloat(String(inv.percentualParticipacao)).toFixed(2)}%
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {inv.total} processo{inv.total !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Barra de progresso */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Taxa de sucesso</span>
                      <span className="font-medium text-foreground">{taxaSucesso}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${taxaSucesso}%` }}
                      />
                    </div>
                  </div>

                  {/* Distribuição por status */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="text-muted-foreground">Ganhos:</span>
                      <span className="font-semibold">{inv.concluido_ganho}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-muted-foreground">Andamento:</span>
                      <span className="font-semibold">{inv.em_andamento}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-muted-foreground">Sentença:</span>
                      <span className="font-semibold">{inv.aguardando_sentenca + inv.cumprimento_de_sentenca}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span className="text-muted-foreground">Perdidos:</span>
                      <span className="font-semibold">{inv.concluido_perdido}</span>
                    </div>
                  </div>

                  {/* TrendingUp indicator */}
                  {inv.total > 0 && (
                    <div className="flex items-center gap-1.5 pt-1 border-t">
                      <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {inv.outros} em outros status
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
