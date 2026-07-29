import { AppBottomNav } from "@/components/AppBottomNav";
import { DriverCommandGrid } from "@/components/DriverCommandGrid";
import { DriverGpsHeartbeat } from "@/components/DriverGpsHeartbeat";
import { DriverRideOfferOverlay } from "@/components/DriverRideOfferOverlay";
import { DriverSessionRecovery } from "@/components/DriverSessionRecovery";
import { DriverTripSettlementSection } from "@/components/DriverTripSettlementSection";
import { PremiumInternalHeader } from "@/components/PremiumInternalHeader";
import { TaxiProfileSettings } from "@/components/TaxiProfileSettings";
import { TaxiSupportActions } from "@/components/TaxiSupportActions";
import { BarChart3, Car, Home, Navigation, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import DriverEarningsPage from "./DriverEarningsPage";
import DriverNavigationPage from "./DriverNavigationPage";
import DriverServicesPage from "./DriverServicesPage";
import DriverTurnPage from "./DriverTurnPage";

export default function DriverApp() {
  const [location, setLocation] = useLocation();
  const isProfile = location.includes("/profile");
  const isSecurity = location.includes("/security");
  const isQueue = location.includes("/queue");
  const isEarnings = location.includes("/earnings");
  const isNavigation = location.includes("/navigation");

  return (
    <div className="min-h-screen bg-black pb-28 md:pb-0">
      <DriverRideOfferOverlay />
      {!isProfile && !isSecurity && <DriverSessionRecovery />}
      {isProfile ? (
        <>
          <PremiumInternalHeader eyebrow="Taximun Driver" title="Mi perfil" description="Gestiona documentación, vehículo y datos profesionales." homePath="/driver" icon={<UserRound className="h-8 w-8" />} tone="dark" />
          <TaxiProfileSettings role="driver" />
        </>
      ) : isSecurity ? (
        <main className="min-h-screen bg-black">
          <PremiumInternalHeader eyebrow="Taximun Driver" title="Seguridad" description="Registra incidencias operativas y accede a la ayuda del servicio." homePath="/driver" icon={<ShieldCheck className="h-8 w-8" />} tone="dark" />
          <div className="mx-auto max-w-3xl px-4 py-6">
            <TaxiSupportActions role="driver" />
          </div>
        </main>
      ) : isQueue ? (
        <div className="min-h-screen bg-black">
          <PremiumInternalHeader eyebrow="Taximun Driver" title="Servicios" description="Revisa ofertas, viaje activo y cierre del servicio." homePath="/driver" icon={<Car className="h-8 w-8" />} tone="dark" />
          <DriverGpsHeartbeat />
          <DriverTripSettlementSection />
          <DriverServicesPage />
        </div>
      ) : isNavigation ? (
        <div className="min-h-screen bg-black">
          <PremiumInternalHeader eyebrow="Taximun Driver" title="Navegación" description="Ruta, llegada, PIN de recogida y seguimiento del viaje." homePath="/driver" icon={<Navigation className="h-8 w-8" />} tone="dark" />
          <DriverGpsHeartbeat />
          <DriverNavigationPage />
        </div>
      ) : isEarnings ? (
        <div className="min-h-screen bg-black">
          <PremiumInternalHeader eyebrow="Taximun Driver" title="Ingresos" description="Consulta cobros, liquidaciones e historial profesional." homePath="/driver" icon={<BarChart3 className="h-8 w-8" />} tone="dark" />
          <DriverEarningsPage />
        </div>
      ) : (
        <div className="min-h-screen bg-black">
          <DriverGpsHeartbeat />
          <DriverCommandGrid />
          <DriverTurnPage />
        </div>
      )}
      <AppBottomNav
        items={[
          { label: "Turno", active: !isProfile && !isSecurity && !isQueue && !isEarnings && !isNavigation, icon: <Home className="h-6 w-6" />, onClick: () => setLocation("/driver") },
          { label: "Servicios", active: isQueue, icon: <Car className="h-6 w-6" />, onClick: () => setLocation("/driver/queue") },
          { label: "Navegar", active: isNavigation, icon: <Navigation className="h-6 w-6" />, onClick: () => setLocation("/driver/navigation") },
          { label: "Ingresos", active: isEarnings, icon: <BarChart3 className="h-6 w-6" />, onClick: () => setLocation("/driver/earnings") },
          { label: "Seguro", active: isSecurity, icon: <ShieldCheck className="h-6 w-6" />, onClick: () => setLocation("/driver/security") },
          { label: "Perfil", active: isProfile, icon: <UserRound className="h-6 w-6" />, onClick: () => setLocation("/driver/profile") },
        ]}
      />
    </div>
  );
}
