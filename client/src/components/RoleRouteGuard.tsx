import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export type AppRole = "passenger" | "driver" | "admin";

export function RoleRouteGuard({ allowed, children }: { allowed: AppRole[]; children: ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const role = user?.role as AppRole | undefined;
  const authorized = Boolean(isAuthenticated && role && allowed.includes(role));

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      setLocation("/auth");
      return;
    }
    if (!authorized) setLocation("/");
  }, [authorized, isAuthenticated, loading, setLocation]);

  if (loading || !isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>;
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-black">Redirigiendo a tu panel</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Esta sección no corresponde al rol real de tu cuenta.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
