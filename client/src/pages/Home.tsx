import { useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/i18n/useI18n";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { clearPendingAuthRole, readPendingAuthRole } from "@/lib/pendingAuthRole";
import { toast } from "sonner";

function routeForRole(role?: string) {
  if (role === "driver") return "/driver";
  if (role === "admin") return "/admin";
  return "/passenger";
}

export default function Home() {
  const { user, loading, isAuthenticated, refresh } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const isApplyingRole = useRef(false);

  const setRoleMutation = trpc.auth.setRole.useMutation({
    onError: () => {
      isApplyingRole.current = false;
      clearPendingAuthRole();
      toast.error(t.common.error);
      setLocation(routeForRole(user?.role));
    },
  });

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      setLocation("/auth");
      return;
    }

    const pendingRole = readPendingAuthRole();
    if (pendingRole && !isApplyingRole.current) {
      isApplyingRole.current = true;
      setRoleMutation.mutate(pendingRole, {
        onSuccess: async () => {
          clearPendingAuthRole();
          await refresh();
          setLocation(routeForRole(pendingRole.role));
        },
      });
      return;
    }

    if (isApplyingRole.current || setRoleMutation.isPending) return;

    setLocation(routeForRole(user?.role));
  }, [isAuthenticated, loading, refresh, setLocation, setRoleMutation, user?.role]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/5">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto" />
        <p className="text-lg text-muted-foreground">
          {setRoleMutation.isPending ? "Preparando tu panel..." : t.common.loading}
        </p>
      </div>
    </div>
  );
}
