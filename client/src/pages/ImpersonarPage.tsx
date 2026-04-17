/**
 * ImpersonarPage — recebe o token de impersonação via query param,
 * valida com o backend e redireciona para o portal correto do usuário.
 *
 * URL: /impersonar?token=<uuid>
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

export default function ImpersonarPage() {
  const token = getTokenFromUrl();
  const [, navigate] = useLocation();

  const { data, error, isLoading } = trpc.auth.validarTokenImpersonacao.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  useEffect(() => {
    if (!token) {
      navigate("/404");
      return;
    }
    if (error) {
      navigate("/404");
      return;
    }
    if (!data) return;

    // Salvar token no sessionStorage para que os portais possam ler
    sessionStorage.setItem("impersonacao_token", token);
    sessionStorage.setItem("impersonacao_usuario", JSON.stringify(data.usuario));
    sessionStorage.setItem("impersonacao_expirado_em", data.expiradoEm.toString());

    // Redirecionar para o portal correto baseado no role/extraRoles
    const roles = data.usuario.extraRoles ?? [];

    if (roles.includes("investidor") && !roles.includes("advogado") && !roles.includes("advogado_investidor")) {
      navigate("/investidor");
    } else {
      // advogado, advogado_investidor, ou fallback
      navigate("/advogado");
    }
  }, [data, error, token, navigate]);

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Token inválido.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Iniciando visualização...</p>
        </div>
      </div>
    );
  }

  return null;
}
