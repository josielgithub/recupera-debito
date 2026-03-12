import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Scale,
  Search,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  Clock,
  AlertCircle,
  Shield,
  FileText,
  Lock,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";

// Ordem dos 12 status para o indicador de progresso
const STATUS_PROGRESSO = [
  "em_analise_inicial",
  "protocolado",
  "em_andamento",
  "aguardando_documentos",
  "aguardando_audiencia",
  "aguardando_sentenca",
  "em_recurso",
  "acordo_negociacao",
  "cumprimento_de_sentenca",
  "concluido_ganho",
  "concluido_perdido",
  "arquivado_encerrado",
];

// Status que representam conclusão (positiva ou negativa)
const STATUS_FINAIS = new Set([
  "concluido_ganho",
  "concluido_perdido",
  "arquivado_encerrado",
]);

function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function validarCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(d[i]!) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(d[9]!)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(d[i]!) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(d[10]!);
}

function formatarData(data: Date | string | null | undefined): string {
  if (!data) return "Não disponível";
  const d = new Date(data);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Indicador de progresso visual dos 12 status
function IndicadorProgresso({ statusAtual }: { statusAtual: string }) {
  const idxAtual = STATUS_PROGRESSO.indexOf(statusAtual);
  const isFinal = STATUS_FINAIS.has(statusAtual);
  const isGanho = statusAtual === "concluido_ganho";
  const isPerdido = statusAtual === "concluido_perdido" || statusAtual === "arquivado_encerrado";

  // Para status finais, mostrar apenas o badge colorido
  if (isFinal) {
    return (
      <div className={`flex items-center gap-2 p-3 rounded-lg ${
        isGanho ? "bg-green-50 border border-green-200" :
        isPerdido ? "bg-red-50 border border-red-200" :
        "bg-slate-50 border border-slate-200"
      }`}>
        <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${
          isGanho ? "text-green-600" : "text-red-500"
        }`} />
        <div>
          <p className={`text-sm font-semibold ${
            isGanho ? "text-green-800" : "text-red-800"
          }`}>
            {STATUS_RESUMIDO_LABELS[statusAtual]}
          </p>
          <p className="text-xs text-muted-foreground">Processo encerrado</p>
        </div>
      </div>
    );
  }

  // Para status em andamento, mostrar barra de progresso simplificada
  // Usar apenas os 9 primeiros status (excluindo os 3 finais)
  const statusEmAndamento = STATUS_PROGRESSO.slice(0, 9);
  const idxEmAndamento = statusEmAndamento.indexOf(statusAtual);
  const progresso = idxEmAndamento >= 0 ? Math.round(((idxEmAndamento + 1) / 9) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progresso do processo</span>
        <span className="font-medium text-foreground">{progresso}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${progresso}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Início</span>
        <span>Conclusão</span>
      </div>
    </div>
  );
}

interface ProcessoResultado {
  indice: number;
  statusResumido: string;
  ultimaAtualizacao: Date | string | null;
  parceiro: {
    nome: string;
    whatsapp: string | null;
    email: string | null;
  } | null;
}

function CardProcesso({ processo, total }: { processo: ProcessoResultado; total: number }) {
  const [aberto, setAberto] = useState(total === 1); // Abrir automaticamente se for único
  const label = STATUS_RESUMIDO_LABELS[processo.statusResumido] ?? processo.statusResumido;
  const cor = STATUS_CORES[processo.statusResumido] ?? "bg-gray-100 text-gray-800";

  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-border hover:bg-muted/20 cursor-pointer transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
              {processo.indice}
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">
                Processo {processo.indice}
                {total > 1 && <span className="text-muted-foreground font-normal"> de {total}</span>}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Atualizado em {formatarData(processo.ultimaAtualizacao)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${cor} border-0 text-xs hidden sm:flex`}>{label}</Badge>
            {aberto ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 p-4 bg-slate-50/80 rounded-lg border border-border/40 space-y-4">
          {/* Status com indicador de progresso */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Status atual
            </p>
            <Badge className={`${cor} border-0 mb-3`}>{label}</Badge>
            <IndicadorProgresso statusAtual={processo.statusResumido} />
          </div>

          <Separator />

          {/* Contato do escritório */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Escritório responsável
            </p>
            {processo.parceiro ? (
              <div className="space-y-2">
                <p className="font-semibold text-sm text-foreground">{processo.parceiro.nome}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {processo.parceiro.whatsapp && (
                    <a
                      href={`https://wa.me/${processo.parceiro.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-md transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      WhatsApp: {processo.parceiro.whatsapp}
                    </a>
                  )}
                  {processo.parceiro.email && (
                    <a
                      href={`mailto:${processo.parceiro.email}`}
                      className="inline-flex items-center gap-2 text-sm text-white bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-md transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {processo.parceiro.email}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/40 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Contato do escritório não disponível no momento. Aguarde atualização.</span>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function Home() {
  const [cpf, setCpf] = useState("");
  const [cpfConsulta, setCpfConsulta] = useState<string | null>(null);
  const [erroValidacao, setErroValidacao] = useState("");

  const { data, isLoading, error } = trpc.consulta.porCpf.useQuery(
    { cpf: cpfConsulta ?? "" },
    { enabled: !!cpfConsulta, retry: false }
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErroValidacao("");
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      setErroValidacao("Digite um CPF completo com 11 dígitos.");
      return;
    }
    if (!validarCpf(cpfLimpo)) {
      setErroValidacao("CPF inválido. Verifique os dígitos e tente novamente.");
      return;
    }
    setCpfConsulta(cpf);
  }

  function handleNovaBusca() {
    setCpf("");
    setCpfConsulta(null);
    setErroValidacao("");
  }

  const erroMsg =
    error?.message ?? "Não foi possível localizar informações para o CPF informado.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <Scale className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-tight">Recupera Débito</h1>
              <p className="text-xs text-muted-foreground">Portal de Consulta de Processos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">
              <Shield className="w-3 h-3 text-green-600" />
              <span>Consulta segura e anônima</span>
            </div>
            <a
              href="/admin"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Lock className="w-3 h-3" />
              <span className="hidden sm:inline">Admin</span>
            </a>
          </div>
        </div>
      </header>

      <main className="container py-10 sm:py-16">
        <div className="max-w-xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-medium mb-4">
              <FileText className="w-3.5 h-3.5" />
              Consulta gratuita · Sem cadastro · Sem login
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3 tracking-tight">
              Acompanhe seu processo
            </h2>
            <p className="text-muted-foreground text-base max-w-sm mx-auto">
              Digite seu CPF para ver o status atualizado e o contato do escritório responsável.
            </p>
          </div>

          {/* Card principal */}
          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Search className="w-4 h-4 text-primary" />
                Consultar por CPF
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="cpf" className="text-sm font-medium text-foreground">
                      CPF do titular
                    </label>
                    <Input
                      id="cpf"
                      type="text"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => {
                        setCpf(formatarCpf(e.target.value));
                        setErroValidacao("");
                        if (cpfConsulta) setCpfConsulta(null);
                      }}
                      className="text-xl tracking-widest h-13 font-mono text-center"
                      maxLength={14}
                      autoComplete="off"
                      autoFocus
                    />
                    {erroValidacao && (
                      <p className="text-sm text-destructive flex items-center gap-1.5 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {erroValidacao}
                      </p>
                    )}
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground border border-border/40">
                    <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-600" />
                    <span>
                      Consulta protegida. Seu IP e CPF são registrados de forma anônima (hash) para
                      segurança do sistema. Limite de consultas por período aplicado.
                    </span>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="py-3">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{erroMsg}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 text-sm font-semibold"
                    disabled={isLoading || cpf.replace(/\D/g, "").length < 11}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Consultando...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Search className="w-4 h-4" />
                        Consultar processo
                      </span>
                    )}
                  </Button>
                </form>
              ) : (
                /* Resultado */
                <div className="space-y-4">
                  {/* Cabeçalho do resultado */}
                  <div className="flex items-start justify-between gap-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        Resultado para
                      </p>
                      <p className="font-bold text-foreground text-base">{data.nomeCliente}</p>
                      <p className="text-sm text-muted-foreground font-mono">{cpfConsulta}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs flex-shrink-0 mt-1">
                      {data.processos.length}{" "}
                      {data.processos.length === 1 ? "processo" : "processos"}
                    </Badge>
                  </div>

                  <Separator />

                  {data.processos.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum processo encontrado para este CPF.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.processos.map((p) => (
                        <CardProcesso
                          key={p.indice}
                          processo={p}
                          total={data.processos.length}
                        />
                      ))}
                    </div>
                  )}

                  <Button variant="outline" className="w-full" onClick={handleNovaBusca}>
                    Realizar nova consulta
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Informações de segurança */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
            {[
              {
                icon: Shield,
                title: "Privacidade garantida",
                desc: "Nenhum dado pessoal é armazenado. Consulta 100% anônima.",
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                icon: Clock,
                title: "Atualização automática",
                desc: "Status sincronizado via integração com o sistema judicial.",
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                icon: Phone,
                title: "Contato direto",
                desc: "Acesse o WhatsApp e e-mail do escritório responsável.",
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 p-3.5 bg-white rounded-lg border border-border/60 shadow-sm"
              >
                <div className={`w-8 h-8 ${item.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div>
                  <p className="font-semibold text-xs text-foreground mb-0.5">{item.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white mt-8">
        <div className="container py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Recupera Débito. Todos os direitos reservados.</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-green-600" />
              Dados protegidos
            </span>
            <a href="/admin" className="hover:text-foreground transition-colors flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Área administrativa
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
