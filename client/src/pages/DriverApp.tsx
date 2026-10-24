import { AppBottomNav } from "@/components/AppBottomNav";
import { DriverCommandGrid } from "@/components/DriverCommandGrid";
import { DriverGpsHeartbeat } from "@/components/DriverGpsHeartbeat";
import { DriverOperationalIdentityCard } from "@/components/DriverOperationalIdentityCard";
import { DriverRideOfferOverlay } from "@/components/DriverRideOfferOverlay";
import { DriverSessionRecovery } from "@/components/DriverSessionRecovery";
import { DriverTipConfirmations } from "@/components/DriverTipConfirmations";
import { DriverTripSettlementSection } from "@/components/DriverTripSettlementSection";
import DriverZoneQueueCard from "@/components/DriverZoneQueueCard";
import { PremiumInternalHeader } from "@/components/PremiumInternalHeader";
import { HomeTopBar } from "@/components/HomeTopBar";
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
    <div className="min-h-screen scroll-pb-[calc(8.5rem+env(safe-area-inset-bottom))] bg-black pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:scroll-pb-0 md:pb-0">
      <DriverRideOfferOverlay />
      {!isProfile && !isSecurity && <DriverSessionRecovery />}
      {isProfile ? (
        <>
          <PremiumInternalHeader eyebrow="Taximun Driver" title="Mi perfil" description="Gestiona por separado el taxi operativo y la documentación profesional." homePath="/driver" icon={<UserRound className="h-8 w-8" />} tone="dark" />
          <DriverOperationalIdentityCard />
          <div className="bg-[#f3f3f3] px-4 pt-6 text-black">
            <div className="mx-auto max-w-5xl rounded-[2rem] bg-black p-5 text-white sm:p-6">
              <p className="text-sm font-black text-white/55">Perfil profesional</p>
              <h2 className="mt-1 text-2xl font-black">Documentación y datos sujetos a revisión</h2>
              <p className="mt-2 text-sm font-semibold text-white/60">Los cambios de identidad, licencia o documentación pueden requerir una nueva aprobación administrativa. El taxi activo se guarda en el bloque anterior.</p>
            </div>
          </div>
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
          <DriverTipConfirmations />
          <DriverEarningsPage />
        </div>
      ) : (
        <div className="min-h-screen bg-black">
          <HomeTopBar brand="Taximun Driver" subtitle="Ajustes y perfil" settingsPath="/driver/profile" />
          <DriverGpsHeartbeat />
          <DriverCommandGrid />
          <DriverZoneQueueCard />
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
