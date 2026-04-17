import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, Clock, AlertCircle, DollarSign } from "lucide-react";
import { toast } from "sonner";

// Custo estimado por consulta Judit (R$)
const CUSTO_POR_CONSULTA = 0.5;

export default function AdminFilaJudit() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const utils = trpc.useUtils();

  const { data: filaData, isLoading } = trpc.admin.filaJudit.useQuery(
    { page, pageSize: 50 },
    { enabled: !!user, refetchInterval: 30000 }
  );

  const aprovar = trpc.admin.aprovarFilaJudit.useMutation({
    onSuccess: (data) => {
      const ok = data.resultados.filter((r: { ok: boolean }) => r.ok).length;
      const err = data.resultados.filter((r: { ok: boolean }) => !r.ok).length;
      const naoEncontrados = data.resultados.filter((r: { ok: boolean; notFound?: boolean }) => r.ok && r.notFound).length;
      if (ok > 0) toast.success(`${ok} processo(s) consultado(s) na Judit com sucesso. ${naoEncontrados > 0 ? `(${naoEncontrados} não encontrados)` : ""}`);
      if (err > 0) toast.error(`${err} processo(s) com erro.`);
      setSelecionados([]);
      setDialogAberto(false);
      utils.admin.filaJudit.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao processar fila");
      setDialogAberto(false);
    },
  });

  const toggleSelecionado = (id: number) => {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleTodos = () => {
    if (!filaData?.processos) return;
    if (selecionados.length === filaData.processos.length) {
      setSelecionados([]);
    } else {
      setSelecionados(filaData.processos.map(p => p.id));
    }
  };

  const custoEstimado = (selecionados.length * CUSTO_POR_CONSULTA).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Fila de Aprovação Judit</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Processos aguardando consulta na Judit. Somente o admin pode aprovar.
        </p>
      </div>

      {/* Alerta de segurança */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Atenção: Ação com custo</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Ao aprovar, o sistema consultará imediatamente a Judit para cada processo selecionado.
            Cada consulta tem custo estimado de <strong>{CUSTO_POR_CONSULTA.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>.
            Revise cuidadosamente antes de aprovar.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Processos na Fila</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {filaData?.total ?? 0} processo(s) aguardando aprovação
            </CardDescription>
          </div>
          {selecionados.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4 text-amber-500" />
                <span>Custo estimado: <strong className="text-amber-700">{custoEstimado}</strong></span>
              </div>
              <Button
                size="sm"
                onClick={() => setDialogAberto(true)}
                disabled={aprovar.isPending}
              >
                {aprovar.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Consultar {selecionados.length} selecionado(s)
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !filaData?.processos.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30 text-green-500" />
              <p className="text-sm">Fila vazia! Nenhum processo aguardando consulta.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selecionados.length === filaData.processos.length && filaData.processos.length > 0}
                        onChange={toggleTodos}
                        className="h-4 w-4"
                      />
                    </TableHead>
                    <TableHead>CNJ</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Advogado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filaData.processos.map((p) => (
                    <TableRow key={p.id} className={selecionados.includes(p.id) ? "bg-blue-50" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selecionados.includes(p.id)}
                          onChange={() => toggleSelecionado(p.id)}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.cnj}</TableCell>
                      <TableCell className="text-sm">
                        <div>{p.clienteNome ?? "—"}</div>
                        {p.clienteCpf && <div className="text-xs text-muted-foreground">{p.clienteCpf}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(p as { advogadoNome?: string }).advogadoNome ?? (p.advogadoId ? `ID ${p.advogadoId}` : "—")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50 gap-1">
                          <Clock className="h-3 w-3" />
                          Aguardando
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginação */}
              {filaData.total > 50 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    Página {page} de {Math.ceil(filaData.total / 50)}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      Anterior
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(filaData.total / 50)}>
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmação com custo */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Confirmar Consulta Judit
            </DialogTitle>
            <DialogDescription>
              Você está prestes a consultar <strong>{selecionados.length} processo(s)</strong> na Judit.
              Esta ação é irreversível e gerará custo.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Processos selecionados:</span>
              <strong>{selecionados.length}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Custo por consulta:</span>
              <span>{CUSTO_POR_CONSULTA.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-amber-200 pt-2 mt-2">
              <span>Custo total estimado:</span>
              <span className="text-amber-700">{custoEstimado}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={aprovar.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => aprovar.mutate({ processoIds: selecionados })}
              disabled={aprovar.isPending}
            >
              {aprovar.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirmar e Consultar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
