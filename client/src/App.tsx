import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import ProcessoDetalhe from "./pages/ProcessoDetalhe";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

// Handles post-OAuth redirect: if the user just logged in and there's a stored returnPath,
// navigate to it and clear the localStorage key.
function OAuthReturnRedirect() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    const returnPath = localStorage.getItem("oauth_return_path");
    if (!returnPath) return;
    localStorage.removeItem("oauth_return_path");
    if (returnPath !== window.location.pathname) {
      setLocation(returnPath);
    }
  }, [user, isLoading, setLocation]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/processo/:cnj" component={ProcessoDetalhe} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <OAuthReturnRedirect />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
