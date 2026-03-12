import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Plus, Edit2, Phone, Mail, Users } from "lucide-react";
import { toast } from "sonner";

interface ParceiroForm {
  nomeEscritorio: string;
  whatsapp: string;
  email: string;
}

const FORM_VAZIO: ParceiroForm = { nomeEscritorio: "", whatsapp: "", email: "" };

export default function AdminParceiros() {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState<ParceiroForm>(FORM_VAZIO);
  const [erros, setErros] = useState<Partial<ParceiroForm>>({});

  const { data: parceiros, isLoading, refetch } = trpc.admin.parceiros.useQuery();
  const upsertMutation = trpc.admin.upsertParceiro.useMutation({
    onSuccess: () => {
      toast.success("Escritório salvo com sucesso!");
      setDialogAberto(false);
      setForm(FORM_VAZIO);
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  function validar(): boolean {
    const e: Partial<ParceiroForm> = {};
    if (!form.nomeEscritorio.trim() || form.nomeEscritorio.trim().length < 2) {
      e.nomeEscritorio = "Nome deve ter ao menos 2 caracteres.";
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = "E-mail inválido.";
    }
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function handleSalvar() {
    if (!validar()) return;
    upsertMutation.mutate({
      nomeEscritorio: form.nomeEscritorio.trim(),
      whatsapp: form.whatsapp.trim() || undefined,
      email: form.email.trim() || undefined,
    });
  }

  function abrirEdicao(p: { nomeEscritorio: string; whatsapp: string | null; email: string | null }) {
    setForm({
      nomeEscritorio: p.nomeEscritorio,
      whatsapp: p.whatsapp ?? "",
      email: p.email ?? "",
    });
    setErros({});
    setDialogAberto(true);
  }

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setErros({});
    setDialogAberto(true);
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Escritórios parceiros
              <Badge variant="outline" className="ml-1 text-xs">{parceiros?.length ?? 0}</Badge>
            </CardTitle>
            <Button size="sm" className="h-8 text-xs" onClick={abrirNovo}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Novo escritório
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : !parceiros || parceiros.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Nenhum escritório cadastrado</p>
              <p className="text-xs mt-1">
                Clique em "Novo escritório" para adicionar o primeiro parceiro.
              </p>
              <Button size="sm" className="mt-3 text-xs" onClick={abrirNovo}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar escritório
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {parceiros.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <p className="font-semibold text-sm text-foreground leading-tight">
                        {p.nomeEscritorio}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={() => abrirEdicao(p)}
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    {p.whatsapp ? (
                      <a
                        href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-green-700 hover:text-green-800 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {p.whatsapp}
                      </a>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground/60">
                        <Phone className="w-3.5 h-3.5" />
                        WhatsApp não informado
                      </p>
                    )}
                    {p.email ? (
                      <a
                        href={`mailto:${p.email}`}
                        className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {p.email}
                      </a>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground/60">
                        <Mail className="w-3.5 h-3.5" />
                        E-mail não informado
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de criação/edição */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {form.nomeEscritorio ? "Editar escritório" : "Novo escritório"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Nome do escritório <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Ex: Escritório Silva & Associados"
                value={form.nomeEscritorio}
                onChange={(e) => setForm((f) => ({ ...f, nomeEscritorio: e.target.value }))}
                className="h-9 text-sm"
              />
              {erros.nomeEscritorio && (
                <p className="text-xs text-destructive">{erros.nomeEscritorio}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                WhatsApp <span className="text-muted-foreground">(opcional)</span>
              </label>
              <Input
                placeholder="(11) 99999-0000"
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                E-mail <span className="text-muted-foreground">(opcional)</span>
              </label>
              <Input
                type="email"
                placeholder="contato@escritorio.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="h-9 text-sm"
              />
              {erros.email && (
                <p className="text-xs text-destructive">{erros.email}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSalvar} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </span>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
