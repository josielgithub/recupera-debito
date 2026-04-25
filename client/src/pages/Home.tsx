import { useState } from "react";
import { motion } from "framer-motion";
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
  Paperclip,
  TrendingUp,
  Gavel,
  RotateCcw,
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

// Textos descritivos por status em linguagem simples para o cliente
const STATUS_DESCRICAO: Record<string, string> = {
  em_analise_inicial: "Seu processo foi recebido e está sendo analisado pela equipe jurídica.",
  protocolado: "O processo foi protocolado no tribunal e aguarda distribuição ao juiz.",
  em_andamento: "O processo está em andamento no tribunal. O juiz está analisando as peças.",
  aguardando_documentos: "O processo aguarda entrega de documentos ou informações adicionais.",
  aguardando_audiencia: "Uma audiência foi marcada. Aguardamos a data para a realização.",
  aguardando_sentenca: "O juiz está analisando o caso e em breve proferirá a sentença.",
  em_recurso: "O processo está em recurso na instância superior. Aguardamos a decisão.",
  acordo_negociacao: "Estamos em fase de negociação para um acordo favorável.",
  cumprimento_de_sentenca: "A sentença foi favorável! Estamos na fase de recebimento do valor.",
  concluido_ganho: "Parabéns! O processo foi concluído com resultado favorável.",
  concluido_perdido: "O processo foi encerrado. Entre em contato com seu advogado para orientações.",
  arquivado_encerrado: "O processo foi arquivado. Entre em contato com seu advogado para mais detalhes.",
};

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

function formatarDataSimples(data: Date | string | null | undefined): string {
  if (!data) return "";
  const d = new Date(data);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Indicador de progresso visual com Framer Motion e textos descritivos
function IndicadorProgresso({ statusAtual }: { statusAtual: string }) {
  const isFinal = STATUS_FINAIS.has(statusAtual);
  const isGanho = statusAtual === "concluido_ganho";
  const isPerdido = statusAtual === "concluido_perdido" || statusAtual === "arquivado_encerrado";
  const isRecurso = statusAtual === "em_recurso";
  const isCumprimento = statusAtual === "cumprimento_de_sentenca";

  const descricao = STATUS_DESCRICAO[statusAtual] ?? "Processo em andamento.";

  // Para status finais, mostrar badge colorido com mensagem
  if (isFinal) {
    return (
      <div className={`flex items-start gap-3 p-3 rounded-lg ${
        isGanho ? "bg-green-50 border border-green-200" :
        isPerdido ? "bg-red-50 border border-red-200" :
        "bg-slate-50 border border-slate-200"
      }`}>
        <CheckCircle2 className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
          isGanho ? "text-green-600" : "text-red-500"
        }`} />
        <div>
          <p className={`text-sm font-semibold ${
            isGanho ? "text-green-800" : "text-red-800"
          }`}>
            {STATUS_RESUMIDO_LABELS[statusAtual]}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>
        </div>
      </div>
    );
  }

  // Caso especial: em recurso — mostrar ícone específico
  if (isRecurso) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <RotateCcw className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Processo em recurso</p>
            <p className="text-xs text-amber-700 mt-0.5">{descricao}</p>
          </div>
        </div>
      </div>
    );
  }

  // Caso especial: cumprimento de sentença — destaque positivo
  if (isCumprimento) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <TrendingUp className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Fase de recebimento do valor</p>
            <p className="text-xs text-emerald-700 mt-0.5">{descricao}</p>
          </div>
        </div>
      </div>
    );
  }

  // Para status em andamento, mostrar barra de progresso animada com Framer Motion
  // Usar apenas os 9 primeiros status (excluindo os 3 finais)
  const statusEmAndamento = STATUS_PROGRESSO.slice(0, 9);
  const idxEmAndamento = statusEmAndamento.indexOf(statusAtual);
  const progresso = idxEmAndamento >= 0 ? Math.round(((idxEmAndamento + 1) / 9) * 100) : 10;

  // Cor da barra baseada no progresso
  const corBarra =
    progresso < 34 ? "bg-blue-500" :
    progresso < 67 ? "bg-indigo-500" :
    "bg-violet-500";

  return (
    <div className="space-y-3">
      {/* Texto descritivo */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-100">
        <Gavel className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600" />
        <p className="text-xs text-blue-800 leading-relaxed">{descricao}</p>
      </div>

      {/* Barra de progresso */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progresso do processo</span>
          <span className="font-semibold text-foreground">{progresso}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <motion.div
            className={`${corBarra} h-2.5 rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${progresso}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Início</span>
          <span>Conclusão</span>
        </div>
      </div>
    </div>
  );
}

interface DocumentoProcesso {
  nome: string;
  extensao: string | null;
  dataDocumento: Date | string | null;
}

interface ProcessoResultado {
  indice: number;
  statusResumido: string;
  ultimaAtualizacao: Date | string | null;
  autosDisponiveis: boolean;
  documentos: DocumentoProcesso[];
  // Advogado vinculado ao processo (novo sistema)
  advogado: {
    nome: string | null;
    whatsapp: string | null;
    oab: string | null;
  } | null;
  // Parceiro legado (mantido para compatibilidade)
  parceiro: {
    nome: string;
    whatsapp: string | null;
    email: string | null;
  } | null;
}

function BadgeExtensao({ extensao }: { extensao: string | null }) {
  const ext = (extensao ?? "").toLowerCase().replace(".", "");
  if (ext === "pdf") {
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wide">
        PDF
      </span>
    );
  }
  if (ext === "doc" || ext === "docx") {
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wide">
        DOC
      </span>
    );
  }
  if (ext) {
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide">
        {ext}
      </span>
    );
  }
  return null;
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
            {processo.autosDisponiveis && (
              <span title="Documentos disponíveis" className="hidden sm:flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                <Paperclip className="w-3 h-3" />
                Docs
              </span>
            )}
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

          {/* Documentos do processo */}
          {processo.autosDisponiveis && processo.documentos.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  Documentos do processo disponíveis
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {processo.documentos.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-white rounded border border-border/50 text-xs"
                    >
                      <BadgeExtensao extensao={doc.extensao} />
                      <span className="flex-1 text-foreground truncate" title={doc.nome}>
                        {doc.nome}
                      </span>
                      {doc.dataDocumento && (
                        <span className="text-muted-foreground flex-shrink-0">
                          {formatarDataSimples(doc.dataDocumento)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {processo.documentos.length} documento{processo.documentos.length !== 1 ? "s" : ""} registrado{processo.documentos.length !== 1 ? "s" : ""}. Para acesso ao conteúdo, entre em contato com seu advogado.
                </p>
              </div>
            </>
          )}

          <Separator />

          {/* Contato do advogado responsável */}
          {(processo.advogado || processo.parceiro) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Advogado responsável
              </p>
              {processo.advogado ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-foreground">{processo.advogado.nome ?? "Advogado"}</p>
                    {processo.advogado.oab && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{processo.advogado.oab}</span>
                    )}
                  </div>
                  {processo.advogado.whatsapp && (
                    <a
                      href={`https://wa.me/55${processo.advogado.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-md transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Falar com advogado
                    </a>
                  )}
                </div>
              ) : processo.parceiro ? (
                // Fallback legado: mostrar parceiro se não houver advogado vinculado
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
              ) : null}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatarTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validarTelefone(tel: string): boolean {
  const d = tel.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 11;
}

export default function Home() {
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpfConsulta, setCpfConsulta] = useState<string | null>(null);
  const [telefoneConsulta, setTelefoneConsulta] = useState<string | null>(null);
  const [erroValidacao, setErroValidacao] = useState("");
  const [erroTelefone, setErroTelefone] = useState("");

  const { data, isLoading, error } = trpc.consulta.porCpf.useQuery(
    { cpf: cpfConsulta ?? "", telefone: telefoneConsulta ?? "" },
    { enabled: !!cpfConsulta && !!telefoneConsulta, retry: false }
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErroValidacao("");
    setErroTelefone("");
    let valido = true;
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      setErroValidacao("Digite um CPF completo com 11 dígitos.");
      valido = false;
    } else if (!validarCpf(cpfLimpo)) {
      setErroValidacao("CPF inválido. Verifique os dígitos e tente novamente.");
      valido = false;
    }
    if (!validarTelefone(telefone)) {
      setErroTelefone("Digite um telefone válido com DDD (ex: (11) 99999-0000).");
      valido = false;
    }
    if (!valido) return;
    setCpfConsulta(cpf);
    setTelefoneConsulta(telefone);
  }

  function handleNovaBusca() {
    setCpf("");
    setTelefone("");
    setCpfConsulta(null);
    setTelefoneConsulta(null);
    setErroValidacao("");
    setErroTelefone("");
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
                      onChange={(e) => setCpf(formatarCpf(e.target.value))}
                      maxLength={14}
                      className={erroValidacao ? "border-destructive" : ""}
                      disabled={isLoading}
                    />
                    {erroValidacao && (
                      <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <AlertDescription className="text-xs">{erroValidacao}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="telefone" className="text-sm font-medium text-foreground">
                      Telefone cadastrado
                    </label>
                    <Input
                      id="telefone"
                      type="text"
                      inputMode="numeric"
                      placeholder="(11) 99999-0000"
                      value={telefone}
                      onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                      maxLength={15}
                      className={erroTelefone ? "border-destructive" : ""}
                      disabled={isLoading}
                    />
                    {erroTelefone && (
                      <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <AlertDescription className="text-xs">{erroTelefone}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                  {error && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <AlertDescription className="text-xs">{erroMsg}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full" disabled={isLoading}>
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
                          processo={p as ProcessoResultado}
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
