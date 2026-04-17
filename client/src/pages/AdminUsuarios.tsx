import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Copy, CheckCircle, XCircle, Users, Link, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const ROLE_LABELS: Record<string, string> = {
  advogado: "Advogado",
  investidor: "Investidor",
  advogado_investidor: "Advogado & Investidor",
};

/** Aplica máscara de telefone: (00) 00000-0000 ou (00) 0000-0000 */
function mascaraTelefone(valor: string): string {
  const digits = valor.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

// ─── Dialog de Edição de Usuário ────────────────────────────────────────────
interface EditarUsuarioDialogProps {
  usuario: {
    id: number;
    name: string | null;
    email: string | null;
    telefone?: string | null;
    oab?: string | null;
    whatsappSuporte?: string | null;
    bio?: string | null;
    extraRoles?: string[] | null;
  };
  onSuccess: () => void;
}

function EditarUsuarioDialog({ usuario, onSuccess }: EditarUsuarioDialogProps) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(usuario.name ?? "");
  const [telefone, setTelefone] = useState(
    usuario.telefone ? mascaraTelefone(usuario.telefone) : ""
  );
  const [oab, setOab] = useState(usuario.oab ?? "");
  const [whatsappSuporte, setWhatsappSuporte] = useState(
    usuario.whatsappSuporte ? mascaraTelefone(usuario.whatsappSuporte) : ""
  );
  const [bio, setBio] = useState(usuario.bio ?? "");

  // Verifica se o usuário é advogado (para mostrar campos extras)
  const extraRoles = usuario.extraRoles ?? [];
  const isAdvogado = extraRoles.includes("advogado") || extraRoles.includes("advogado_investidor");

  const editar = trpc.admin.editarUsuario.useMutation({
    onSuccess: () => {
      toast.success("Dados atualizados com sucesso");
      setOpen(false);
      onSuccess();
    },
    onError: (err) => toast.error(err.message || "Erro ao atualizar usuário"),
  });

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setNome(usuario.name ?? "");
      setTelefone(usuario.telefone ? mascaraTelefone(usuario.telefone) : "");
      setOab(usuario.oab ?? "");
      setWhatsappSuporte(usuario.whatsappSuporte ? mascaraTelefone(usuario.whatsappSuporte) : "");
      setBio(usuario.bio ?? "");
    }
  };

  const handleSalvar = () => {
    const nomeTrimmed = nome.trim();
    if (nomeTrimmed.length < 2) {
      toast.error("Nome deve ter pelo menos 2 caracteres");
      return;
    }
    if (nomeTrimmed.length > 100) {
      toast.error("Nome deve ter no máximo 100 caracteres");
      return;
    }
    const telefoneLimpo = telefone.replace(/\D/g, "");
    if (telefoneLimpo && (telefoneLimpo.length < 10 || telefoneLimpo.length > 11)) {
      toast.error("Telefone deve ter 10 ou 11 dígitos");
      return;
    }
    const whatsappLimpo = whatsappSuporte.replace(/\D/g, "");
    if (whatsappLimpo && (whatsappLimpo.length < 10 || whatsappLimpo.length > 11)) {
      toast.error("WhatsApp de suporte deve ter 10 ou 11 dígitos");
      return;
    }
    editar.mutate({
      usuarioId: usuario.id,
      nome: nomeTrimmed,
      telefone: telefoneLimpo || null,
      ...(isAdvogado && {
        oab: oab.trim() || null,
        whatsappSuporte: whatsappLimpo || null,
        bio: bio.trim() || null,
      }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Editar dados do usuário">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
          <DialogDescription>
            Atualize os dados do usuário. O e-mail não pode ser alterado pois vem do OAuth.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Email (somente leitura) */}
          <div className="space-y-1.5">
            <Label className="text-sm">E-mail (somente leitura)</Label>
            <Input
              value={usuario.email ?? "—"}
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-nome" className="text-sm">
              Nome completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              maxLength={100}
            />
          </div>

          {/* Telefone */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-telefone" className="text-sm">
              Telefone / WhatsApp
            </Label>
            <Input
              id="edit-telefone"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
              maxLength={15}
            />
            <p className="text-xs text-muted-foreground">Opcional. Apenas números serão salvos.</p>
          </div>

          {/* Campos exclusivos de advogado */}
          {isAdvogado && (
            <>
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Dados do Advogado</p>
              </div>

              {/* OAB */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-oab" className="text-sm">OAB</Label>
                <Input
                  id="edit-oab"
                  value={oab}
                  onChange={(e) => setOab(e.target.value)}
                  placeholder="Ex: OAB/MT 12345"
                  maxLength={30}
                />
              </div>

              {/* WhatsApp de suporte */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-whatsapp-suporte" className="text-sm">
                  WhatsApp de suporte
                </Label>
                <Input
                  id="edit-whatsapp-suporte"
                  value={whatsappSuporte}
                  onChange={(e) => setWhatsappSuporte(mascaraTelefone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="numeric"
                  maxLength={15}
                />
                <p className="text-xs text-muted-foreground">Número exibido no portal do cliente.</p>
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-bio" className="text-sm">Bio / Apresentação</Label>
                <textarea
                  id="edit-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ex: Especialista em direito do consumidor"
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
                <p className="text-xs text-muted-foreground">{bio.length}/500 caracteres</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={editar.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={editar.isPending}>
            {editar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog de Gerar Convite ─────────────────────────────────────────────────
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

// ─── Página Principal ─────────────────────────────────────────────────────────
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
                      <TableHead>Telefone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Acesso Extra</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map((u) => {
                      const extraRoles = (u.extraRoles as string[] | null) ?? [];
                      const telefoneFormatado = (u as { telefone?: string | null }).telefone
                        ? mascaraTelefone((u as { telefone: string }).telefone)
                        : null;
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="text-sm font-medium">{u.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {telefoneFormatado ?? <span className="text-xs text-muted-foreground/50">—</span>}
                          </TableCell>
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
                            <div className="flex items-center justify-end gap-1">
                              {/* Botão de edição — disponível para todos os usuários */}
                              <EditarUsuarioDialog
                                usuario={{
                                  id: u.id,
                                  name: u.name,
                                  email: u.email,
                                  telefone: (u as { telefone?: string | null }).telefone,
                                  oab: (u as { oab?: string | null }).oab,
                                  whatsappSuporte: (u as { whatsappSuporte?: string | null }).whatsappSuporte,
                                  bio: (u as { bio?: string | null }).bio,
                                  extraRoles: (u.extraRoles as string[] | null),
                                }}
                                onSuccess={() => utils.admin.listarUsuarios.invalidate()}
                              />
                              {/* Botão de ativar/desativar — apenas para não-admins */}
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
                            </div>
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
