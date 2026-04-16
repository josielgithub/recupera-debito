import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function AdminFilaJudit() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const utils = trpc.useUtils();

  const { data: filaData, isLoading } = trpc.admin.filaJudit.useQuery(
    { page, pageSize: 50 },
    { enabled: !!user, refetchInterval: 30000 }
  );

  const aprovar = trpc.admin.aprovarFilaJudit.useMutation({
    onSuccess: (data) => {
      const ok = data.resultados.filter(r => r.ok).length;
      const err = data.resultados.filter(r => !r.ok).length;
      if (ok > 0) toast.success(`${ok} processo(s) consultado(s) na Judit com sucesso.`);
      if (err > 0) toast.error(`${err} processo(s) com erro.`);
      setSelecionados([]);
      utils.admin.filaJudit.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao processar fila"),
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

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Fila de Aprovação Judit</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Processos aguardando consulta na Judit. Somente o admin pode aprovar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
          ← Voltar ao Admin
        </Button>
      </div>

      {/* Alerta de segurança */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Atenção: Ação irreversível</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Ao aprovar, o sistema consultará imediatamente a Judit para cada processo selecionado. 
            Cada consulta tem custo. Revise cuidadosamente antes de aprovar.
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
            <Button
              size="sm"
              onClick={() => {
                if (confirm(`Consultar ${selecionados.length} processo(s) na Judit agora?`)) {
                  aprovar.mutate({ processoIds: selecionados });
                }
              }}
              disabled={aprovar.isPending}
            >
              {aprovar.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-1" />
              )}
              Consultar {selecionados.length} selecionado(s)
            </Button>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Advogado ID</TableHead>
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
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">
                          <Clock className="h-3 w-3" />
                          Aguardando
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.advogadoId ?? "—"}
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
    </div>
  );
}
