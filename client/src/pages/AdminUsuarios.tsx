import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Copy, CheckCircle, XCircle, Users, Link, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const ROLE_LABELS: Record<string, string> = {
  advogado: "Advogado",
  investidor: "Investidor",
  advogado_investidor: "Advogado & Investidor",
};

function GerarConviteDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [roleConvite, setRoleConvite] = useState<"advogado" | "investidor" | "advogado_investidor">("advogado");
  const [linkGerado, setLinkGerado] = useState<string | null>(null);

  const gerar = trpc.admin.gerarConvite.useMutation({
    onSuccess: (data) => {
      const link = `${window.location.origin}/convite/${data.token}`;
      setLinkGerado(link);
      onSuccess();
    },
    onError: (err) => toast.error(err.message || "Erro ao gerar convite"),
  });

  const copiarLink = () => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado);
    toast.success("Link copiado!");
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setLinkGerado(null);
      setRoleConvite("advogado");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Gerar Convite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar Link de Convite</DialogTitle>
          <DialogDescription>
            Crie um link de convite para um advogado ou investidor. O link pode ser usado uma única vez.
          </DialogDescription>
        </DialogHeader>

        {!linkGerado ? (
          <>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tipo de acesso</label>
                <Select value={roleConvite} onValueChange={(v) => setRoleConvite(v as typeof roleConvite)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advogado">Advogado Parceiro</SelectItem>
                    <SelectItem value="investidor">Investidor</SelectItem>
                    <SelectItem value="advogado_investidor">Advogado & Investidor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => gerar.mutate({ roleConvite })}
                disabled={gerar.isPending}
              >
                {gerar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Gerar Link
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs font-medium text-green-800 mb-2">Link gerado com sucesso!</p>
              <p className="text-xs text-green-700 break-all font-mono">{linkGerado}</p>
            </div>
            <Button className="w-full" onClick={copiarLink}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar Link
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Este link pode ser usado uma única vez. Compartilhe com o destinatário.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsuarios() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: usuarios, isLoading: loadingUsuarios } = trpc.admin.listarUsuarios.useQuery();
  const { data: convites, isLoading: loadingConvites } = trpc.admin.listarConvites.useQuery();

  const desativar = trpc.admin.desativarUsuario.useMutation({
    onSuccess: () => {
      toast.success("Status do usuário atualizado.");
      utils.admin.listarUsuarios.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao atualizar usuário"),
  });

  const revogar = trpc.admin.revogarConvite.useMutation({
    onSuccess: () => {
      toast.success("Convite revogado.");
      utils.admin.listarConvites.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao revogar convite"),
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Gestão de Usuários</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie convites e usuários do sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
          ← Voltar ao Admin
        </Button>
      </div>

      <Tabs defaultValue="convites">
        <TabsList>
          <TabsTrigger value="convites">
            <Link className="h-4 w-4 mr-1.5" />
            Convites
          </TabsTrigger>
          <TabsTrigger value="usuarios">
            <Users className="h-4 w-4 mr-1.5" />
            Usuários
          </TabsTrigger>
        </TabsList>

        {/* Aba de Convites */}
        <TabsContent value="convites">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Links de Convite</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Gere links para convidar advogados e investidores
                </CardDescription>
              </div>
              <GerarConviteDialog onSuccess={() => utils.admin.listarConvites.invalidate()} />
            </CardHeader>
            <CardContent>
              {loadingConvites ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : !convites?.length ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Link className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum convite gerado ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Gerado em</TableHead>
                      <TableHead>Usado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {convites.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.token}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {ROLE_LABELS[c.roleConvite] ?? c.roleConvite}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {c.ativo && !c.usadoPor ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle className="h-3 w-3" /> Ativo
                            </span>
                          ) : c.usadoPor ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                              <CheckCircle className="h-3 w-3" /> Utilizado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700">
                              <XCircle className="h-3 w-3" /> Revogado
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.geradoEm ? new Date(c.geradoEm).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.usadoEm ? new Date(c.usadoEm).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.ativo && !c.usadoPor && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const link = `${window.location.origin}/convite/${c.token}`;
                                    navigator.clipboard.writeText(link);
                                    toast.success("Link copiado!");
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    if (confirm("Revogar este convite?")) {
                                      revogar.mutate({ id: c.id });
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Usuários */}
        <TabsContent value="usuarios">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Usuários do Sistema</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Gerencie o acesso dos usuários
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUsuarios ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : !usuarios?.length ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum usuário encontrado.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Acesso Extra</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map((u) => {
                      const extraRoles = (u.extraRoles as string[] | null) ?? [];
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="text-sm font-medium">{u.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                              {u.role === "admin" ? "Admin" : "Usuário"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {extraRoles.length > 0 ? extraRoles.map(r => (
                                <Badge key={r} variant="outline" className="text-xs">
                                  {ROLE_LABELS[r] ?? r}
                                </Badge>
                              )) : (
                                <span className="text-xs text-muted-foreground">Nenhum</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {u.ativo ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                                <CheckCircle className="h-3 w-3" /> Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-700">
                                <XCircle className="h-3 w-3" /> Inativo
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {u.role !== "admin" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => desativar.mutate({ id: u.id, ativo: !u.ativo })}
                                disabled={desativar.isPending}
                              >
                                {u.ativo ? "Desativar" : "Ativar"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
