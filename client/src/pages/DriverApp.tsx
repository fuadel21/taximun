import { AppBottomNav } from "@/components/AppBottomNav";
import { DriverGpsHeartbeat } from "@/components/DriverGpsHeartbeat";
import { DriverRideOfferOverlay } from "@/components/DriverRideOfferOverlay";
import { DriverSessionRecovery } from "@/components/DriverSessionRecovery";
import { DriverTripSettlementSection } from "@/components/DriverTripSettlementSection";
import { TaxiProfileSettings } from "@/components/TaxiProfileSettings";
import { TaxiSupportActions } from "@/components/TaxiSupportActions";
import { BarChart3, Car, Home, Navigation, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import DriverEarningsPage from "./DriverEarningsPage";
import DriverNavigationPage from "./DriverNavigationPage";
import DriverPanelModern from "./DriverPanelModern";
import DriverServicesPage from "./DriverServicesPage";

export default function DriverApp() {
  const [location, setLocation] = useLocation();
  const isProfile = location.includes("/profile");
  const isSecurity = location.includes("/security");
  const isQueue = location.includes("/queue");
  const isEarnings = location.includes("/earnings");
  const isNavigation = location.includes("/navigation");

  return (
    <div className="pb-24 md:pb-0">
      <DriverRideOfferOverlay />
      {!isProfile && !isSecurity && <DriverSessionRecovery />}
      {isProfile ? (
        <TaxiProfileSettings role="driver" />
      ) : isSecurity ? (
        <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-700">Taximun Driver</p>
              <h1 className="text-3xl font-black">Seguridad conductor</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">Registra incidencias reales para revisión del administrador.</p>
            </div>
            <TaxiSupportActions role="driver" />
          </div>
        </main>
      ) : isQueue ? (
        <div className="min-h-screen bg-[#f7f8fb]">
          <DriverGpsHeartbeat />
          <DriverTripSettlementSection />
          <DriverServicesPage />
        </div>
      ) : isNavigation ? (
        <div className="min-h-screen bg-[#f7f8fb]">
          <DriverGpsHeartbeat />
          <DriverNavigationPage />
        </div>
      ) : isEarnings ? (
        <DriverEarningsPage />
      ) : (
        <div className="min-h-screen bg-slate-950">
          <DriverGpsHeartbeat />
          <DriverPanelModern />
        </div>
      )}
      <AppBottomNav
        items={[
          { label: "Turno", active: !isProfile && !isSecurity && !isQueue && !isEarnings && !isNavigation, icon: <Home className="h-5 w-5" />, onClick: () => setLocation("/driver") },
          { label: "Servicios", active: isQueue, icon: <Car className="h-5 w-5" />, onClick: () => setLocation("/driver/queue") },
          { label: "Navegar", active: isNavigation, icon: <Navigation className="h-5 w-5" />, onClick: () => setLocation("/driver/navigation") },
          { label: "Ingresos", active: isEarnings, icon: <BarChart3 className="h-5 w-5" />, onClick: () => setLocation("/driver/earnings") },
          { label: "Seguro", active: isSecurity, icon: <ShieldCheck className="h-5 w-5" />, onClick: () => setLocation("/driver/security") },
          { label: "Perfil", active: isProfile, icon: <UserRound className="h-5 w-5" />, onClick: () => setLocation("/driver/profile") },
        ]}
      />
    </div>
  );
}
