/**
 * Serviço de importação de planilha Excel
 * Colunas esperadas: cpf, nome, cnj, status_interno, advogado, nome_escritorio, whatsapp_escritorio, email_escritorio
 */
import * as XLSX from "xlsx";
import { upsertCliente, upsertParceiro, upsertProcesso } from "./db";
import { cadastrarProcessoMonitoramentoPush } from "./codilo";
import { updateMonitoramentoAtivo } from "./db";

export interface LinhaImportacao {
  cpf?: string;
  nome?: string;
  cnj?: string;
  status_interno?: string;
  advogado?: string;
  nome_escritorio?: string;
  whatsapp_escritorio?: string;
  email_escritorio?: string;
}

export interface ResultadoImportacao {
  totalLinhas: number;
  linhasOk: number;
  linhasErro: number;
  detalhes: Array<{
    linha: number;
    status: "ok" | "erro";
    cpf?: string;
    cnj?: string;
    erro?: string;
  }>;
}

function limparCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function formatarCpf(cpf: string): string {
  const d = limparCpf(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function validarCpf(cpf: string): boolean {
  const d = limparCpf(cpf);
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

function limparCnj(cnj: string): string {
  return cnj.replace(/[^\d.-]/g, "").trim();
}

function validarCnj(cnj: string): boolean {
  // Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO (20 dígitos)
  const digits = cnj.replace(/\D/g, "");
  return digits.length === 20;
}

export async function processarPlanilha(
  buffer: Buffer,
  callbackBaseUrl: string
): Promise<ResultadoImportacao> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia ou inválida");

  const sheet = workbook.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<LinhaImportacao>(sheet, {
    defval: "",
    raw: false,
  });

  const resultado: ResultadoImportacao = {
    totalLinhas: rows.length,
    linhasOk: 0,
    linhasErro: 0,
    detalhes: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const linhaNum = i + 2; // +2 porque linha 1 é cabeçalho

    // Normalizar chaves (case-insensitive, remover espaços)
    const normalizedRow: LinhaImportacao = {};
    for (const [key, value] of Object.entries(row)) {
      const k = key.toLowerCase().replace(/\s+/g, "_").trim() as keyof LinhaImportacao;
      (normalizedRow as Record<string, unknown>)[k] = String(value ?? "").trim();
    }

    const cpfRaw = normalizedRow.cpf ?? "";
    const nome = normalizedRow.nome ?? "";
    const cnjRaw = normalizedRow.cnj ?? "";
    const nomeEscritorio = normalizedRow.nome_escritorio ?? "";

    // Validações obrigatórias
    if (!cpfRaw) {
      resultado.linhasErro++;
      resultado.detalhes.push({ linha: linhaNum, status: "erro", erro: "CPF ausente" });
      continue;
    }
    if (!validarCpf(cpfRaw)) {
      resultado.linhasErro++;
      resultado.detalhes.push({ linha: linhaNum, status: "erro", cpf: cpfRaw, erro: "CPF inválido" });
      continue;
    }
    if (!nome) {
      resultado.linhasErro++;
      resultado.detalhes.push({ linha: linhaNum, status: "erro", cpf: cpfRaw, erro: "Nome ausente" });
      continue;
    }
    if (!cnjRaw) {
      resultado.linhasErro++;
      resultado.detalhes.push({ linha: linhaNum, status: "erro", cpf: cpfRaw, erro: "CNJ ausente" });
      continue;
    }
    if (!validarCnj(cnjRaw)) {
      resultado.linhasErro++;
      resultado.detalhes.push({ linha: linhaNum, status: "erro", cpf: cpfRaw, cnj: cnjRaw, erro: "CNJ inválido (deve ter 20 dígitos)" });
      continue;
    }

    const cpf = formatarCpf(cpfRaw);
    const cnj = limparCnj(cnjRaw);

    try {
      // 1. Upsert cliente
      const clienteId = await upsertCliente({ cpf, nome });

      // 2. Upsert parceiro (se informado)
      let parceiroId: number | undefined;
      if (nomeEscritorio) {
        parceiroId = await upsertParceiro({
          nomeEscritorio,
          whatsapp: normalizedRow.whatsapp_escritorio || null,
          email: normalizedRow.email_escritorio || null,
        });
      }

      // 3. Upsert processo
      await upsertProcesso({
        cnj,
        clienteId,
        parceiroId: parceiroId ?? null,
        advogado: normalizedRow.advogado || null,
        statusInterno: normalizedRow.status_interno || null,
        statusResumido: "em_analise_inicial",
      });

      // 4. Cadastrar no Monitoramento PUSH da Codilo
      const callbackUrl = `${callbackBaseUrl}/api/codilo/callback`;
      const pushResult = await cadastrarProcessoMonitoramentoPush(cnj, callbackUrl);
      if (pushResult.sucesso) {
        await updateMonitoramentoAtivo(cnj, true, pushResult.codiloProcessoId);
      }

      resultado.linhasOk++;
      resultado.detalhes.push({ linha: linhaNum, status: "ok", cpf, cnj });
    } catch (err: unknown) {
      resultado.linhasErro++;
      const msg = err instanceof Error ? err.message : String(err);
      resultado.detalhes.push({ linha: linhaNum, status: "erro", cpf, cnj: cnjRaw, erro: msg });
    }
  }

  return resultado;
}
