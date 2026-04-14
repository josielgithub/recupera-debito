import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Key,
  Webhook,
  CheckCircle2,
  AlertCircle,
  Info,
  Code,
  Globe,
  Shield,
} from "lucide-react";

interface EnvVar {
  key: string;
  description: string;
  required: boolean;
  example?: string;
  status?: "configured" | "missing" | "optional";
}

const ENV_VARS: EnvVar[] = [
  {
    key: "CODILO_CLIENT_ID",
    description: "Client ID para autenticação OAuth2 na API Codilo. Obtido no painel da Codilo.",
    required: true,
    example: "seu-client-id-aqui",
    status: "missing",
  },
  {
    key: "CODILO_CLIENT_SECRET",
    description: "Client Secret para autenticação OAuth2 na API Codilo.",
    required: true,
    example: "seu-client-secret-aqui",
    status: "missing",
  },
  {
    key: "CODILO_CALLBACK_SECRET",
    description:
      "Segredo para validar webhooks recebidos da Codilo (header X-Codilo-Secret). Pode ser qualquer string aleatória segura.",
    required: false,
    example: "string-aleatoria-segura-32-chars",
    status: "optional",
  },
];

const FLUXOS = [
  {
    titulo: "1. Importação de processos",
    passos: [
      "Acesse a aba Importação no dashboard",
      'Baixe a planilha modelo clicando em "Baixar modelo"',
      "Preencha com os dados dos clientes (CPF, nome, CNJ, escritório)",
      "Faça upload da planilha preenchida",
      "Verifique o relatório de importação para corrigir erros",
      "Os processos serão automaticamente cadastrados no monitoramento Codilo (se configurado)",
    ],
  },
  {
    titulo: "2. Recebimento de atualizações (Webhook Codilo)",
    passos: [
      "Configure o endpoint de callback na Codilo: POST /api/codilo/callback",
      "Defina o CODILO_CALLBACK_SECRET para validação de segurança",
      "A Codilo enviará atualizações automáticas quando o status do processo mudar",
      "O sistema normalizará o status recebido para os 12 estados resumidos",
      "O cliente poderá ver o status atualizado no portal público",
    ],
  },

  {
    titulo: "4. Consulta pública por CPF",
    passos: [
      "O cliente acessa o portal público e digita o CPF",
      "O sistema valida o CPF (formato e dígito verificador)",
      "Rate limit: máx. 10 consultas/min por IP, 20/hora por CPF",
      "Todas as consultas são registradas com IP e CPF hasheados (SHA-256)",
      "O resultado mostra status resumido, data de atualização e contato do escritório",
    ],
  },
];

const STATUS_MAPEAMENTOS = [
  { codilo: "ganho, procedente, parcialmente procedente", resumido: "Concluído – Ganho" },
  { codilo: "improcedente, perdido, julgado improcedente", resumido: "Concluído – Perdido" },
  { codilo: "arquivado, encerrado, extinto", resumido: "Arquivado / Encerrado" },
  { codilo: "cumprimento, execução", resumido: "Cumprimento de sentença" },
  { codilo: "em andamento, tramitando", resumido: "Em andamento" },
  { codilo: "recurso, apelação, agravo", resumido: "Em recurso" },
  { codilo: "audiência, designado", resumido: "Aguardando audiência" },
  { codilo: "sentença, julgamento", resumido: "Aguardando sentença" },
  { codilo: "acordo, negociação, conciliação", resumido: "Acordo / Negociação" },
  { codilo: "documentos, diligência", resumido: "Aguardando documentos" },
  { codilo: "protocolado, distribuído, ajuizado", resumido: "Protocolado" },
  { codilo: "(outros / não mapeados)", resumido: "Em análise inicial" },
];

export default function AdminConfig() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Variáveis de ambiente */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            Variáveis de ambiente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Configure estas variáveis nas{" "}
            <strong>Configurações do projeto → Secrets</strong> no painel do Manus, ou via
            painel de segredos na interface de chat.
          </p>
          {ENV_VARS.map((v) => (
            <div key={v.key} className="p-3 rounded-lg border border-border bg-card space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded">
                  {v.key}
                </code>
                {v.required ? (
                  <Badge className="bg-red-100 text-red-700 border-0 text-xs">Obrigatório</Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Opcional</Badge>
                )}
                {v.status === "missing" && (
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <AlertCircle className="w-3 h-3" />
                    Não configurado
                  </div>
                )}
                {v.status === "optional" && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Info className="w-3 h-3" />
                    Recomendado para produção
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{v.description}</p>
              {v.example && (
                <p className="text-xs text-muted-foreground">
                  Exemplo:{" "}
                  <code className="bg-muted px-1 rounded font-mono">{v.example}</code>
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Endpoint de callback */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Webhook className="w-4 h-4 text-primary" />
            Endpoint de webhook (Codilo)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Configure este endpoint no painel da Codilo para receber atualizações automáticas de
            status dos processos monitorados.
          </p>
          <div className="p-3 bg-slate-900 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-green-600 text-white border-0 text-xs">POST</Badge>
              <code className="text-xs text-green-400 font-mono">
                {window.location.origin}/api/codilo/callback
              </code>
            </div>
            <p className="text-xs text-slate-400">
              Header de segurança:{" "}
              <code className="text-slate-300">X-Codilo-Secret: [CODILO_CALLBACK_SECRET]</code>
            </p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
            <p className="font-semibold text-foreground">Payload esperado (JSON):</p>
            <pre className="text-muted-foreground font-mono text-xs overflow-x-auto">{`{
  "cnj": "0000001-02.2023.8.26.0001",
  "status": "ganho",
  "descricao": "Processo julgado procedente",
  "dataAtualizacao": "2024-03-12T10:00:00Z"
}`}</pre>
          </div>
        </CardContent>
      </Card>

      {/* Fluxos de uso */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Fluxos de uso do sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {FLUXOS.map((fluxo, i) => (
            <div key={i}>
              {i > 0 && <Separator className="mb-4" />}
              <p className="text-xs font-semibold text-foreground mb-2">{fluxo.titulo}</p>
              <ol className="space-y-1">
                {fluxo.passos.map((passo, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="w-4 h-4 bg-primary/10 text-primary rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">
                      {j + 1}
                    </span>
                    {passo}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Mapeamento de status */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Code className="w-4 h-4 text-primary" />
            Mapeamento de status (Codilo → Sistema)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            O sistema normaliza automaticamente os status recebidos da API Codilo para os 12 estados
            resumidos. A correspondência é feita por palavras-chave (case-insensitive).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">
                    Status Codilo (palavras-chave)
                  </th>
                  <th className="text-left py-2 font-semibold text-muted-foreground">
                    Status resumido no sistema
                  </th>
                </tr>
              </thead>
              <tbody>
                {STATUS_MAPEAMENTOS.map((m, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-2 pr-4 text-muted-foreground font-mono">{m.codilo}</td>
                    <td className="py-2 font-medium text-foreground">{m.resumido}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Segurança */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Configurações de segurança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Rate limit por IP", value: "10 consultas/minuto" },
              { label: "Rate limit por CPF", value: "20 consultas/hora" },
              { label: "Hash de IP", value: "SHA-256 (irreversível)" },
              { label: "Hash de CPF", value: "SHA-256 (irreversível)" },
              { label: "Autenticação admin", value: "Manus OAuth (role=admin)" },
              { label: "Validação webhook", value: "Header X-Codilo-Secret" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="text-muted-foreground">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
            <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-blue-700">
              Para promover um usuário a administrador, acesse o banco de dados e altere o campo{" "}
              <code className="bg-blue-100 px-1 rounded">role</code> para{" "}
              <code className="bg-blue-100 px-1 rounded">'admin'</code> na tabela{" "}
              <code className="bg-blue-100 px-1 rounded">users</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
