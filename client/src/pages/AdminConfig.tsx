import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  Settings,
  Shield,
  Users,
  Zap,
  Save,
  UserPlus,
  UserMinus,
  ExternalLink,
  Brain,
  Scale,
} from "lucide-react";

// ─── Seção 1: Status das Integrações ─────────────────────────────────────────
function SecaoStatusIntegracoes() {
  const { data: metricsJudit } = trpc.admin.metricsJudit.useQuery();

  const integracoes = [
    {
      nome: "Judit API",
      descricao: "Consulta automatizada de processos judiciais",
      icon: Scale,
      ativa: true,
      detalhe: metricsJudit
        ? `${metricsJudit.consultasMes} consultas este mês · R$ ${Number(metricsJudit.custoMes ?? 0).toFixed(2)} gastos`
        : "Carregando métricas...",
      cor: "text-green-600",
      bgCor: "bg-green-50 border-green-200",
      link: "https://judit.io",
    },
    {
      nome: "Manus LLM",
      descricao: "Análise inteligente de processos com IA",
      icon: Brain,
      ativa: true,
      detalhe: "Integração nativa — sem chave de API necessária",
      cor: "text-blue-600",
      bgCor: "bg-blue-50 border-blue-200",
      link: "https://manus.im/app",
    },
    {
      nome: "Manus OAuth",
      descricao: "Autenticação de usuários via Manus",
      icon: Shield,
      ativa: true,
      detalhe: "Integração nativa — sem configuração necessária",
      cor: "text-purple-600",
      bgCor: "bg-purple-50 border-purple-200",
      link: "https://manus.im/app",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Status das Integrações
        </CardTitle>
        <CardDescription>
          Visão geral das integrações ativas no sistema
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {integracoes.map((integ) => {
          const Icon = integ.icon;
          return (
            <div
              key={integ.nome}
              className={`flex items-start gap-3 rounded-lg border p-4 ${integ.bgCor}`}
            >
              <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${integ.cor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{integ.nome}</span>
                  {integ.ativa && (
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ativa
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{integ.descricao}</p>
                <p className="text-xs text-muted-foreground mt-1">{integ.detalhe}</p>
              </div>
              <a
                href={integ.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0"
              >
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground pt-1">
          Para verificar o consumo detalhado da LLM Manus, acesse{" "}
          <a
            href="https://manus.im/app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            manus.im/app → Configurações → Uso
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Seção 2: Configurações Gerais ────────────────────────────────────────────
function SecaoConfiguracoesGerais() {
  const { data: configs, refetch } = trpc.admin.getConfiguracoes.useQuery();
  const salvar = trpc.admin.salvarConfiguracoes.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [nomeSistema, setNomeSistema] = useState("");
  const [emailContato, setEmailContato] = useState("");
  const [whatsappContato, setWhatsappContato] = useState("");

  const nomeSistemaVal = nomeSistema !== "" ? nomeSistema : (configs?.nome_sistema ?? "");
  const emailContatoVal = emailContato !== "" ? emailContato : (configs?.email_contato ?? "");
  const whatsappContatoVal = whatsappContato !== "" ? whatsappContato : (configs?.whatsapp_contato ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    salvar.mutate({
      nome_sistema: nomeSistemaVal,
      email_contato: emailContatoVal,
      whatsapp_contato: whatsappContatoVal,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-slate-500" />
          Configurações Gerais
        </CardTitle>
        <CardDescription>
          Informações básicas do sistema e dados de contato
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome_sistema">Nome do Sistema</Label>
            <Input
              id="nome_sistema"
              value={nomeSistemaVal}
              onChange={(e) => setNomeSistema(e.target.value)}
              placeholder="Recupera Débito"
              disabled={!configs}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email_contato">E-mail de Contato</Label>
            <Input
              id="email_contato"
              type="email"
              value={emailContatoVal}
              onChange={(e) => setEmailContato(e.target.value)}
              placeholder="contato@empresa.com.br"
              disabled={!configs}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_contato">WhatsApp de Contato</Label>
            <Input
              id="whatsapp_contato"
              value={whatsappContatoVal}
              onChange={(e) => setWhatsappContato(e.target.value)}
              placeholder="(65) 99999-9999"
              disabled={!configs}
            />
          </div>
          <Button type="submit" disabled={salvar.isPending || !configs} className="w-full sm:w-auto">
            <Save className="h-4 w-4 mr-2" />
            {salvar.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Seção 3: Segurança e Orçamento ──────────────────────────────────────────
function SecaoSegurancaOrcamento() {
  const { data: configs, refetch } = trpc.admin.getConfiguracoes.useQuery();
  const salvar = trpc.admin.salvarConfiguracoes.useMutation({
    onSuccess: () => {
      toast.success("Limites de orçamento atualizados.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [limiteOrcamento, setLimiteOrcamento] = useState("");
  const [alertaPct, setAlertaPct] = useState("");
  const [alertaCriticoPct, setAlertaCriticoPct] = useState("");

  const limiteVal = limiteOrcamento !== "" ? limiteOrcamento : (configs?.limite_orcamento_judit ?? "1000.00");
  const alertaVal = alertaPct !== "" ? alertaPct : (configs?.alerta_orcamento_pct ?? "20");
  const alertaCriticoVal = alertaCriticoPct !== "" ? alertaCriticoPct : (configs?.alerta_critico_pct ?? "10");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    salvar.mutate({
      limite_orcamento_judit: limiteVal,
      alerta_orcamento_pct: alertaVal,
      alerta_critico_pct: alertaCriticoVal,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-orange-500" />
          Segurança e Orçamento Judit
        </CardTitle>
        <CardDescription>
          Controle de gastos e alertas de consumo da API Judit
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="limite_orcamento">Limite de Orçamento Mensal (R$)</Label>
            <Input
              id="limite_orcamento"
              value={limiteVal}
              onChange={(e) => setLimiteOrcamento(e.target.value)}
              placeholder="1000.00"
              disabled={!configs}
            />
            <p className="text-xs text-muted-foreground">
              Cada consulta Judit custa R$ 0,25. Com R$ 1.000,00 você pode realizar até 4.000 consultas por mês.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="alerta_pct">Alerta de Atenção (% restante)</Label>
              <div className="relative">
                <Input
                  id="alerta_pct"
                  value={alertaVal}
                  onChange={(e) => setAlertaPct(e.target.value)}
                  placeholder="20"
                  disabled={!configs}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Alerta amarelo quando restar X% do orçamento</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alerta_critico_pct">Alerta Crítico (% restante)</Label>
              <div className="relative">
                <Input
                  id="alerta_critico_pct"
                  value={alertaCriticoVal}
                  onChange={(e) => setAlertaCriticoPct(e.target.value)}
                  placeholder="10"
                  disabled={!configs}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Alerta vermelho quando restar X% do orçamento</p>
            </div>
          </div>
          <Button type="submit" disabled={salvar.isPending || !configs} className="w-full sm:w-auto">
            <Save className="h-4 w-4 mr-2" />
            {salvar.isPending ? "Salvando..." : "Salvar Limites"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Seção 4: Gestão de Admins ────────────────────────────────────────────────
function SecaoGestaoAdmins() {
  const { data: usuarios, refetch } = trpc.admin.listarUsuarios.useQuery();
  const promover = trpc.admin.promoverAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin promovido com sucesso.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.admin.removerAdmin.useMutation({
    onSuccess: () => {
      toast.success("Acesso de administrador revogado.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const admins = usuarios?.filter((u) => u.role === "admin") ?? [];
  const naoAdmins = usuarios?.filter((u) => u.role !== "admin" && u.ativo) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-500" />
          Gestão de Administradores
        </CardTitle>
        <CardDescription>
          Promova ou remova permissões de administrador. Deve existir pelo menos 1 admin no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Admins atuais */}
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
            Administradores Atuais ({admins.length})
          </h4>
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum administrador encontrado.</p>
          ) : (
            <div className="space-y-2">
              {admins.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {u.foto ? (
                      <img src={u.foto} alt={u.name ?? ""} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-indigo-700">
                          {(u.name ?? "?")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name ?? "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? u.openId}</p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={remover.isPending}
                      >
                        <UserMinus className="h-3.5 w-3.5 mr-1" />
                        Remover
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover acesso de admin?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O usuário <strong>{u.name ?? u.email}</strong> perderá o acesso ao painel administrativo.
                          Esta ação pode ser desfeita promovendo o usuário novamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => remover.mutate({ usuarioId: u.id })}
                        >
                          Remover Admin
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usuários que podem ser promovidos */}
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
            Promover Usuário a Admin
          </h4>
          {naoAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não há usuários ativos para promover.</p>
          ) : (
            <div className="space-y-2">
              {naoAdmins.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {u.foto ? (
                      <img src={u.foto} alt={u.name ?? ""} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold">
                          {(u.name ?? "?")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name ?? "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? u.openId}</p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0 text-green-600 border-green-200 hover:bg-green-50"
                        disabled={promover.isPending}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Promover
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Promover a administrador?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O usuário <strong>{u.name ?? u.email}</strong> terá acesso completo ao painel
                          administrativo, incluindo importação de dados, consultas Judit e gestão de usuários.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => promover.mutate({ usuarioId: u.id })}
                        >
                          Confirmar Promoção
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function AdminConfig() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações do Sistema</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie integrações, configurações gerais, orçamento e permissões de administrador.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <SecaoStatusIntegracoes />
          <SecaoConfiguracoesGerais />
        </div>
        <div className="space-y-6">
          <SecaoSegurancaOrcamento />
          <SecaoGestaoAdmins />
        </div>
      </div>
    </div>
  );
}
