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
} from "lucide-react";
import { STATUS_RESUMIDO_LABELS, STATUS_CORES } from "@shared/const";

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
  const [aberto, setAberto] = useState(false);
  const label = STATUS_RESUMIDO_LABELS[processo.statusResumido] ?? processo.statusResumido;
  const cor = STATUS_CORES[processo.statusResumido] ?? "bg-gray-100 text-gray-800";

  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {processo.indice}
            </div>
            <div>
              <p className="font-medium text-foreground text-sm">
                Processo {processo.indice}/{total}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {formatarData(processo.ultimaAtualizacao)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${cor} border-0 text-xs`}>{label}</Badge>
            {aberto ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 p-4 bg-muted/20 rounded-lg border border-border/50 space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Status atual
            </p>
            <Badge className={`${cor} border-0`}>{label}</Badge>
          </div>
          <Separator />
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Escritório responsável
            </p>
            {processo.parceiro ? (
              <div className="space-y-2">
                <p className="font-medium text-sm text-foreground">{processo.parceiro.nome}</p>
                {processo.parceiro.whatsapp && (
                  <a
                    href={`https://wa.me/${processo.parceiro.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    {processo.parceiro.whatsapp}
                  </a>
                )}
                {processo.parceiro.email && (
                  <a
                    href={`mailto:${processo.parceiro.email}`}
                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    {processo.parceiro.email}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Informação não disponível</p>
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

  const { data, isLoading, error, refetch } = trpc.consulta.porCpf.useQuery(
    { cpf: cpfConsulta ?? "" },
    {
      enabled: !!cpfConsulta,
      retry: false,
    }
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
    error?.message ??
    (error ? "Não foi possível localizar informações para o CPF informado." : null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Recupera Débito</h1>
              <p className="text-xs text-muted-foreground">Portal de Consulta de Processos</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Consulta segura</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="container py-10 sm:py-16">
        <div className="max-w-2xl mx-auto">
          {/* Título */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-medium mb-4">
              <FileText className="w-3.5 h-3.5" />
              Consulta gratuita e sem cadastro
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
              Acompanhe seu processo
            </h2>
            <p className="text-muted-foreground text-base max-w-md mx-auto">
              Digite seu CPF para consultar o status atualizado do seu processo jurídico e obter o
              contato do escritório responsável.
            </p>
          </div>

          {/* Formulário de Consulta */}
          <Card className="shadow-lg border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" />
                Consultar por CPF
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
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
                      }}
                      className="text-lg tracking-wider h-12"
                      maxLength={14}
                      autoComplete="off"
                    />
                    {erroValidacao && (
                      <p className="text-sm text-destructive flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {erroValidacao}
                      </p>
                    )}
                  </div>

                  {/* Aviso de CAPTCHA */}
                  <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground">
                    <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      Esta consulta é protegida contra uso automatizado. Suas consultas são
                      registradas de forma anônima para segurança do sistema.
                    </span>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{erroMsg}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 text-base"
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
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                        Resultado para
                      </p>
                      <p className="font-semibold text-foreground">{data.nomeCliente}</p>
                      <p className="text-sm text-muted-foreground">{cpfConsulta}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {data.processos.length}{" "}
                      {data.processos.length === 1 ? "processo" : "processos"}
                    </Badge>
                  </div>

                  <Separator />

                  {data.processos.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      Nenhum processo encontrado para este CPF.
                    </p>
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

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleNovaBusca}
                  >
                    Realizar nova consulta
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            {[
              {
                icon: Shield,
                title: "Seguro e privado",
                desc: "Seus dados são protegidos e a consulta não requer cadastro.",
              },
              {
                icon: Clock,
                title: "Atualização automática",
                desc: "Status atualizado automaticamente via integração com o sistema judicial.",
              },
              {
                icon: Phone,
                title: "Contato direto",
                desc: "Acesse o contato do escritório responsável pelo seu processo.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex flex-col items-center text-center p-4 bg-white rounded-lg border border-border/60 shadow-sm"
              >
                <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <p className="font-semibold text-sm text-foreground mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white mt-12">
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Recupera Débito. Todos os direitos reservados.</span>
          <a href="/admin" className="hover:text-foreground transition-colors flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Área administrativa
          </a>
        </div>
      </footer>
    </div>
  );
}
