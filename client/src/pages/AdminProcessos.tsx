import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Edit2,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";
import { toast } from "sonner";

const STATUS_OPTIONS = Object.entries(STATUS_RESUMIDO_LABELS);

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_RESUMIDO_LABELS[status] ?? status;
  const cor = STATUS_CORES[status] ?? "bg-gray-100 text-gray-800";
  return <Badge className={`${cor} border-0 text-xs`}>{label}</Badge>;
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

interface ProcessoRow {
  cnj: string;
  statusResumido: string;
  statusInterno: string | null;
  advogado: string | null;
  updatedAt: Date | string;
  clienteNome: string | null;
  clienteCpf: string | null;
  parceiroNome: string | null;
}

export default function AdminProcessos() {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ProcessoRow | null>(null);
  const [novoStatus, setNovoStatus] = useState("");

  const { data, isLoading, refetch } = trpc.admin.processos.useQuery({ page: pagina });
  const atualizarMutation = trpc.admin.atualizarStatusProcesso.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso!");
      setEditando(null);
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const processos = (data?.processos ?? []) as ProcessoRow[];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / 50);

  // Filtro local por busca
  const processosFiltrados = busca
    ? processos.filter(
        (p) =>
          p.cnj.toLowerCase().includes(busca.toLowerCase()) ||
          (p.clienteNome ?? "").toLowerCase().includes(busca.toLowerCase()) ||
          (p.clienteCpf ?? "").includes(busca) ||
          (p.parceiroNome ?? "").toLowerCase().includes(busca.toLowerCase())
      )
    : processos;

  function abrirEdicao(p: ProcessoRow) {
    setEditando(p);
    setNovoStatus(p.statusResumido);
  }

  function salvarStatus() {
    if (!editando || !novoStatus) return;
    atualizarMutation.mutate({ cnj: editando.cnj, status: novoStatus as any });
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Todos os processos
              <Badge variant="outline" className="ml-1 text-xs">{total}</Badge>
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por CNJ, nome, CPF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : processosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {busca ? "Nenhum processo encontrado para esta busca." : "Nenhum processo cadastrado."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">CNJ</TableHead>
                    <TableHead className="text-xs font-semibold">Cliente</TableHead>
                    <TableHead className="text-xs font-semibold">Escritório</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Atualizado</TableHead>
                    <TableHead className="text-xs font-semibold w-16">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processosFiltrados.map((p) => (
                    <TableRow key={p.cnj} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[160px] truncate">
                        {p.cnj}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          <p className="font-medium text-foreground truncate max-w-[120px]">
                            {p.clienteNome ?? "—"}
                          </p>
                          <p className="text-muted-foreground font-mono">{p.clienteCpf ?? "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {p.parceiroNome ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.statusResumido} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatarData(p.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => abrirEdicao(p)}
                          title="Alterar status"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && !busca && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Página {pagina} de {totalPaginas} ({total} processos)
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de edição de status */}
      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Alterar status do processo</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <p className="font-mono text-muted-foreground">{editando.cnj}</p>
                <p className="font-medium text-foreground">{editando.clienteNome ?? "—"}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Novo status</label>
                <Select value={novoStatus} onValueChange={setNovoStatus}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={salvarStatus}
              disabled={atualizarMutation.isPending || novoStatus === editando?.statusResumido}
            >
              {atualizarMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Salvar
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
