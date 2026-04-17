/**
 * ImpersonacaoBanner — barra fixa amarela exibida quando o admin está
 * visualizando o portal de outro usuário via modo "Visualizar como".
 *
 * Lê o token do sessionStorage. Se não houver token, não renderiza nada.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ImpersonacaoUsuario {
  id: number;
  name: string | null;
  role: string;
  extraRoles?: string[] | null;
}

function getRoleLabel(usuario: ImpersonacaoUsuario): string {
  const roles = usuario.extraRoles ?? [];
  if (roles.includes("advogado_investidor")) return "Advogado / Investidor";
  if (roles.includes("advogado")) return "Advogado";
  if (roles.includes("investidor")) return "Investidor";
  return usuario.role;
}

export default function ImpersonacaoBanner() {
  const [token, setToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<ImpersonacaoUsuario | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem("impersonacao_token");
    const u = sessionStorage.getItem("impersonacao_usuario");
    if (t) setToken(t);
    if (u) {
      try {
        setUsuario(JSON.parse(u));
      } catch {
        // ignore
      }
    }
  }, []);

  const encerrar = trpc.admin.encerrarImpersonacao.useMutation({
    onSuccess: () => {
      sessionStorage.removeItem("impersonacao_token");
      sessionStorage.removeItem("impersonacao_usuario");
      sessionStorage.removeItem("impersonacao_expirado_em");
      // Fechar aba ou redirecionar para o admin
      if (window.opener) {
        window.close();
      } else {
        window.location.href = "/admin/usuarios";
      }
    },
    onError: (e) => toast.error(`Erro ao encerrar: ${e.message}`),
  });

  if (!token || !usuario) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] bg-yellow-400 text-yellow-900 px-4 py-2 flex items-center justify-between shadow-md"
      style={{ minHeight: "48px" }}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
        <span>
          Você está visualizando como{" "}
          <strong>{usuario.name ?? "Usuário"}</strong>{" "}
          ({getRoleLabel(usuario)}) — Esta é uma visualização administrativa
        </span>
      </div>
      <button
        onClick={() => encerrar.mutate({ token })}
        disabled={encerrar.isPending}
        className="ml-4 flex-shrink-0 bg-yellow-900 text-yellow-100 hover:bg-yellow-800 text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-60"
      >
        {encerrar.isPending ? "Encerrando..." : "Voltar ao painel admin"}
      </button>
    </div>
  );
}
