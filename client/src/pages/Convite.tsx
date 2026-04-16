import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, Scale, TrendingUp, Briefcase } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  advogado: {
    label: "Advogado Parceiro",
    icon: <Scale className="h-8 w-8 text-blue-600" />,
    description: "Você terá acesso ao portal de advogados para cadastrar processos e acompanhar seus casos.",
  },
  investidor: {
    label: "Investidor",
    icon: <TrendingUp className="h-8 w-8 text-green-600" />,
    description: "Você terá acesso ao portal do investidor para acompanhar seus lotes e projeções financeiras.",
  },
  advogado_investidor: {
    label: "Advogado & Investidor",
    icon: <Briefcase className="h-8 w-8 text-purple-600" />,
    description: "Você terá acesso completo: portal de advogados e portal do investidor.",
  },
};

export default function Convite() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [vinculado, setVinculado] = useState(false);

  const { data: conviteData, isLoading: verificando } = trpc.convite.verificar.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const vincularMutation = trpc.convite.vincularAoUsuario.useMutation({
    onSuccess: (data) => {
      setVinculado(true);
      toast.success("Acesso liberado com sucesso!");
      // Redirecionar após 2s
      setTimeout(() => {
        const roles = data.extraRoles;
        if (roles.includes("advogado")) {
          setLocation("/advogado");
        } else if (roles.includes("investidor")) {
          setLocation("/investidor");
        } else {
          setLocation("/");
        }
      }, 2000);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao vincular convite");
    },
  });

  // Se usuário logado e convite válido, vincular automaticamente
  useEffect(() => {
    if (!user || !conviteData?.valido || vinculado || vincularMutation.isPending) return;
    vincularMutation.mutate({ token: token ?? "" });
  }, [user, conviteData]);

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>Link inválido</CardTitle>
            <CardDescription>O link de convite não é válido.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (verificando || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">Verificando convite...</p>
        </div>
      </div>
    );
  }

  if (!conviteData?.valido) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>Convite inválido</CardTitle>
            <CardDescription>{conviteData?.motivo ?? "Este link de convite não é válido."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const roleInfo = ROLE_LABELS[conviteData.roleConvite ?? ""] ?? {
    label: conviteData.roleConvite ?? "Usuário",
    icon: <Briefcase className="h-8 w-8 text-gray-600" />,
    description: "Você receberá acesso ao sistema.",
  };

  if (vinculado) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Acesso liberado!</CardTitle>
            <CardDescription>Redirecionando para o seu portal...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            {roleInfo.icon}
          </div>
          <CardTitle className="text-xl">Você foi convidado</CardTitle>
          <CardDescription className="mt-1">
            Você recebeu um convite para acessar o sistema como:
          </CardDescription>
          <Badge variant="secondary" className="mx-auto mt-2 text-sm px-3 py-1">
            {roleInfo.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {roleInfo.description}
          </p>

          {vincularMutation.isPending && (
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Liberando acesso...</span>
            </div>
          )}

          {!user && !vincularMutation.isPending && (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Para aceitar o convite, faça login com sua conta Manus:
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  // Salvar o token no localStorage para vincular após OAuth
                  localStorage.setItem("convite_token", token);
                  window.location.href = getLoginUrl(`/convite/${token}`);
                }}
              >
                Entrar e aceitar convite
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
