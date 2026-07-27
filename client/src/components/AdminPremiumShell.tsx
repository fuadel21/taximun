import type { ReactNode } from "react";
import { Activity, BellRing, ShieldCheck, Stethoscope, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import { PremiumInternalHeader } from "./PremiumInternalHeader";

const metadata = {
  "/admin/operations": { title: "Operaciones", description: "Viajes, conductores y control en tiempo real.", icon: <Activity className="h-8 w-8" /> },
  "/admin/verification": { title: "Verificación", description: "Documentación, conductores y validaciones pendientes.", icon: <UserCheck className="h-8 w-8" /> },
  "/admin/safety": { title: "Seguridad", description: "Auditoría, incidencias y protección de usuarios.", icon: <ShieldCheck className="h-8 w-8" /> },
  "/admin/health": { title: "Salud del sistema", description: "Estado de servicios, conexiones y componentes críticos.", icon: <Stethoscope className="h-8 w-8" /> },
  "/admin/alerts": { title: "Alertas", description: "Avisos que requieren revisión o actuación administrativa.", icon: <BellRing className="h-8 w-8" /> },
  "/admin/incidents": { title: "Incidencias", description: "Alertas e incidencias abiertas del servicio.", icon: <BellRing className="h-8 w-8" /> },
} as const;

export function AdminPremiumShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const current = metadata[location as keyof typeof metadata];

  if (!current) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#f3f3f3]">
      <PremiumInternalHeader eyebrow="Taximun Admin" title={current.title} description={current.description} homePath="/admin/dashboard" icon={current.icon} />
      {children}
    </div>
  );
}
