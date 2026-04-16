import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Layers, Users } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function CriarLoteDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [percentualEmpresa, setPercentualEmpresa] = useState("0");

  const criar = trpc.admin.criarLote.useMutation({
    onSuccess: () => {
      toast.success("Lote criado com sucesso!");
      setOpen(false);
      setNome("");
      setDescricao("");
      setPercentualEmpresa("0");
      onSuccess();
    },
    onError: (err) => toast.error(err.message || "Erro ao criar lote"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Criar Lote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Novo Lote</DialogTitle>
          <DialogDescription>
            Um lote agrupa processos para distribuição de resultados entre investidores.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome do Lote</Label>
            <Input
              placeholder="Ex: Lote Janeiro 2025"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input
              placeholder="Descrição do lote"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Percentual da Empresa (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="0"
              value={percentualEmpresa}
              onChange={(e) => setPercentualEmpresa(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Percentual que fica com a empresa. O restante é distribuído entre os investidores.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => criar.mutate({
              nome,
              descricao: descricao || undefined,
              percentualEmpresa: parseFloat(percentualEmpresa) || 0,
            })}
            disabled={!nome.trim() || criar.isPending}
          >
            {criar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminLotes() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: lotes, isLoading } = trpc.admin.listarLotes.useQuery();

  const editarAtivo = trpc.admin.editarLote.useMutation({
    onSuccess: () => {
      toast.success("Lote atualizado.");
      utils.admin.listarLotes.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao atualizar lote"),
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Gestão de Lotes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie e gerencie lotes para distribuição de resultados entre investidores
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
          ← Voltar ao Admin
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Lotes</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {lotes?.length ?? 0} lote(s) cadastrado(s)
            </CardDescription>
          </div>
          <CriarLoteDialog onSuccess={() => utils.admin.listarLotes.invalidate()} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !lotes?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum lote cadastrado ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>% Empresa</TableHead>
                  <TableHead>Investidores</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotes.map((lote) => (
                  <TableRow key={lote.id}>
                    <TableCell className="font-medium text-sm">{lote.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lote.descricao ?? "—"}</TableCell>
                    <TableCell className="text-sm">{lote.percentualEmpresa ?? 0}%</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {lote.investidores?.length ?? 0}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={lote.ativo ? "default" : "secondary"} className="text-xs">
                        {lote.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editarAtivo.mutate({ loteId: lote.id, ativo: !lote.ativo })}
                        disabled={editarAtivo.isPending}
                      >
                        {lote.ativo ? "Desativar" : "Ativar"}
                      </Button>
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
