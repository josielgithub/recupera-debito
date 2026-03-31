/**
 * Serviço de importação simplificada de planilha Excel
 * Colunas esperadas: cnj, nome_cliente, advogado, escritorio
 * Após importar, dispara conciliação automática com a API Judit em background.
 */
import * as XLSX from "xlsx";
import {
  upsertCliente,
  upsertParceiro,
  upsertProcesso,
  criarImportJob,
  updateImportJob,
  getImportJob,
} from "./db";
import { buscarESalvarProcessoJudit } from "./judit";

export interface LinhaImportacaoSimples {
  cnj?: string;
  nome_cliente?: string;
  advogado?: string;
  escritorio?: string;
}

export interface DetalheImportacao {
  linha: number;
  cnj: string;
  nomeCliente: string;
  status: "importado" | "erro_importacao" | "conciliado" | "nao_encontrado_judit" | "erro_judit";
  erro?: string;
  statusJudit?: string;
}

function limparCnj(cnj: string): string {
  return cnj.replace(/[^\d.-]/g, "").trim();
}

function validarCnj(cnj: string): boolean {
  const digits = cnj.replace(/\D/g, "");
  return digits.length === 20;
}

/**
 * Fase 1: Lê a planilha, valida e salva os processos no banco.
 * Retorna o jobId para acompanhamento do progresso.
 */
export async function importarPlanilhaSimples(
  buffer: Buffer,
  nomeArquivo: string
): Promise<{
  jobId: number;
  totalLinhas: number;
  linhasOk: number;
  linhasErro: number;
  detalhes: DetalheImportacao[];
}> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia ou inválida");

  const sheet = workbook.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  // Normalizar cabeçalhos
  const normalizedRows: LinhaImportacaoSimples[] = rows.map((row) => {
    const norm: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const k = key
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .trim();
      norm[k] = String(value ?? "").trim();
    }
    return {
      cnj: norm["cnj"] ?? norm["numero_cnj"] ?? norm["numero_processo"] ?? norm["processo"] ?? "",
      nome_cliente: norm["nome_cliente"] ?? norm["cliente"] ?? norm["nome"] ?? "",
      advogado: norm["advogado"] ?? norm["nome_advogado"] ?? "",
      escritorio: norm["escritorio"] ?? norm["nome_escritorio"] ?? norm["escritorio_parceiro"] ?? "",
    };
  });

  const detalhes: DetalheImportacao[] = [];
  let linhasOk = 0;
  let linhasErro = 0;

  // Criar job no banco
  const jobId = await criarImportJob(nomeArquivo, normalizedRows.length);

  for (let i = 0; i < normalizedRows.length; i++) {
    const row = normalizedRows[i]!;
    const linhaNum = i + 2;

    const cnjRaw = row.cnj ?? "";
    const nomeCliente = row.nome_cliente ?? "";

    if (!cnjRaw) {
      linhasErro++;
      detalhes.push({ linha: linhaNum, cnj: "", nomeCliente, status: "erro_importacao", erro: "CNJ ausente" });
      continue;
    }

    const cnj = limparCnj(cnjRaw);

    if (!validarCnj(cnj)) {
      linhasErro++;
      detalhes.push({ linha: linhaNum, cnj: cnjRaw, nomeCliente, status: "erro_importacao", erro: "CNJ inválido (deve ter 20 dígitos)" });
      continue;
    }

    try {
      // 1. Upsert cliente (sem CPF — apenas nome)
      const clienteId = nomeCliente
        ? await upsertCliente({ nome: nomeCliente })
        : await upsertCliente({ nome: `Cliente CNJ ${cnj}` });

      // 2. Upsert parceiro (escritório)
      let parceiroId: number | undefined;
      const nomeEscritorio = row.escritorio?.trim();
      if (nomeEscritorio) {
        parceiroId = await upsertParceiro({ nomeEscritorio });
      }

      // 3. Upsert processo
      await upsertProcesso({
        cnj,
        clienteId,
        parceiroId: parceiroId ?? null,
        advogado: row.advogado || null,
        statusResumido: "em_analise_inicial",
      });

      linhasOk++;
      detalhes.push({ linha: linhaNum, cnj, nomeCliente, status: "importado" });
    } catch (err: unknown) {
      linhasErro++;
      const msg = err instanceof Error ? err.message : String(err);
      detalhes.push({ linha: linhaNum, cnj, nomeCliente, status: "erro_importacao", erro: msg });
    }
  }

  // Atualizar job com resultado da importação
  await updateImportJob(jobId, {
    linhasImportadas: linhasOk,
    linhasErro,
    status: linhasOk > 0 ? "conciliando" : "concluido",
    detalhes: detalhes as unknown[],
  });

  return { jobId, totalLinhas: normalizedRows.length, linhasOk, linhasErro, detalhes };
}

/**
 * Fase 2: Concilia os processos importados com a API Judit (em background).
 * Atualiza o job com o progresso em tempo real.
 */
export async function conciliarComJuditBackground(
  jobId: number,
  cnjs: string[]
): Promise<void> {
  let conciliados = 0;
  let naoEncontrados = 0;
  const detalhesAtualizados: DetalheImportacao[] = [];

  // Buscar detalhes atuais do job
  const job = await getImportJob(jobId);
  const detalhesAtuais = (job?.detalhes as DetalheImportacao[] | null) ?? [];

  for (const cnj of cnjs) {
    try {
      const resultado = await buscarESalvarProcessoJudit(cnj);

      const detalheExistente = detalhesAtuais.find((d) => d.cnj === cnj);
      const nomeCliente = detalheExistente?.nomeCliente ?? "";

      if (resultado.notFound) {
        naoEncontrados++;
        detalhesAtualizados.push({
          linha: detalheExistente?.linha ?? 0,
          cnj,
          nomeCliente,
          status: "nao_encontrado_judit",
        });
      } else if (resultado.atualizado) {
        conciliados++;
        detalhesAtualizados.push({
          linha: detalheExistente?.linha ?? 0,
          cnj,
          nomeCliente,
          status: "conciliado",
          statusJudit: resultado.processo?.statusResumido,
        });
      } else {
        naoEncontrados++;
        detalhesAtualizados.push({
          linha: detalheExistente?.linha ?? 0,
          cnj,
          nomeCliente,
          status: "erro_judit",
          erro: "Timeout ou erro na API Judit",
        });
      }
    } catch (err) {
      naoEncontrados++;
      const detalheExistente = detalhesAtuais.find((d) => d.cnj === cnj);
      detalhesAtualizados.push({
        linha: detalheExistente?.linha ?? 0,
        cnj,
        nomeCliente: detalheExistente?.nomeCliente ?? "",
        status: "erro_judit",
        erro: err instanceof Error ? err.message : String(err),
      });
    }

    // Atualizar progresso no banco a cada processo
    const detalhesFinais = [
      ...detalhesAtuais.filter((d) => !detalhesAtualizados.find((u) => u.cnj === d.cnj)),
      ...detalhesAtualizados,
    ];

    await updateImportJob(jobId, {
      linhasConciliadas: conciliados,
      linhasNaoEncontradas: naoEncontrados,
      detalhes: detalhesFinais as unknown[],
    });
  }

  // Marcar job como concluído
  await updateImportJob(jobId, {
    linhasConciliadas: conciliados,
    linhasNaoEncontradas: naoEncontrados,
    status: "concluido",
  });
}
