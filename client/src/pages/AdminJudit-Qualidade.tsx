import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, DollarSign, TrendingUp, Download } from "lucide-react";
import { useState } from "react";

export function SecaoQualidade() {
  const { data: metricas, isLoading: metricsLoading } = trpc.juditQualidade.metricas.useQuery();
  const { data: creditoData } = trpc.juditQualidade.creditoRestante.useQuery();
  const { data: registrosProblemáticos, isLoading: regLoading } = trpc.juditQualidade.registrosProblemáticos.useQuery({ page: 1, pageSize: 50 });
  const [page, setPage] = useState(1);

  const exportarCsv = () => {
    if (!registrosProblemáticos?.registros || registrosProblemáticos.registros.length === 0) return;
    const header = ["CNJ", "Request ID", "Tipo de Problema", "Custo", "Data"];
    const rows = registrosProblemáticos.registros.map((reg: any) => [
      reg.processoCnj,
      reg.requestId ?? "",
      (reg.isDuplicata ? "Duplicata" : "") + (reg.requestIdInvalido ? (reg.isDuplicata ? ", " : "") + "UUID Inválido" : ""),
      Number(reg.custo).toFixed(2),
      new Date(reg.createdAt).toLocaleString("pt-BR"),
    ]);
    const csv = [header, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qualidade-dados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (metricsLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando métricas...</div>;
  }

  const metricsCards = [
    {
      title: "Consultas Válidas",
      value: metricas?.validas ?? 0,
      icon: ShieldCheck,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Consultas Duplicadas",
      value: metricas?.duplicatas ?? 0,
      icon: AlertTriangle,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      subtitle: `Custo: ${metricas?.custoDuplicatasFormatado ?? "R$ 0,00"}`,
    },
    {
      title: "UUID Inválido",
      value: metricas?.requestIdInvalidos ?? 0,
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      title: "Taxa de Sucesso",
      value: `${metricas?.taxaSucesso ?? 0}%`,
      icon: TrendingUp,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricsCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Card key={idx} className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                {card.subtitle && <div className="text-xs text-muted-foreground mt-1">{card.subtitle}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Crédito Restante */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            Crédito Restante Este Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Crédito Disponível</div>
              <div className="text-3xl font-bold text-green-600">{creditoData?.creditoRestanteFormatado ?? "R$ 0,00"}</div>
            </div>
            {creditoData?.custoDuplicatasFormatado && (
              <div className="pt-3 border-t">
                <div className="text-sm text-muted-foreground mb-1">Custo com Duplicatas/Inválidos (não contabilizado)</div>
                <div className="text-lg font-semibold text-orange-600">{creditoData.custoDuplicatasFormatado}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Registros Problemáticos */}
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Registros Problemáticos ({registrosProblemáticos?.total ?? 0})
            </CardTitle>
            <Button size="sm" variant="outline" className="text-xs" onClick={exportarCsv}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {regLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando registros...</div>
          ) : (registrosProblemáticos?.registros ?? []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum registro problemático encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="p-3 text-left font-medium">CNJ</th>
                    <th className="p-3 text-left font-medium">Tipo de Problema</th>
                    <th className="p-3 text-left font-medium">Request ID</th>
                    <th className="p-3 text-left font-medium">Custo</th>
                    <th className="p-3 text-left font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {(registrosProblemáticos?.registros ?? []).map((reg: any) => (
                    <tr key={reg.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{reg.processoCnj}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {reg.isDuplicata && <Badge variant="secondary" className="text-xs">Duplicata</Badge>}
                          {reg.requestIdInvalido && <Badge variant="destructive" className="text-xs">UUID Inválido</Badge>}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{reg.requestId ?? "-"}</td>
                      <td className="p-3 text-right font-medium">R$ {reg.custo?.toFixed(2) ?? "0.00"}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(reg.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
