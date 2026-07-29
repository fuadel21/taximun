import { AppBottomNav } from "@/components/AppBottomNav";
import { PassengerCommandGrid } from "@/components/PassengerCommandGrid";
import { PassengerDispatchStatus } from "@/components/PassengerDispatchStatus";
import { PassengerDriverPublicProfileSection } from "@/components/PassengerDriverPublicProfileSection";
import { PassengerLiveTrackingSection } from "@/components/PassengerLiveTrackingSection";
import { PassengerPostTripRatingSection } from "@/components/PassengerPostTripRatingSection";
import { PassengerSafeCancellationCard } from "@/components/PassengerSafeCancellationCard";
import { PremiumInternalHeader } from "@/components/PremiumInternalHeader";
import { TaxiProfileSettings } from "@/components/TaxiProfileSettings";
import { TaxiSupportActions } from "@/components/TaxiSupportActions";
import "@/styles/passenger-safe-cancellation.css";
import { Car, Home, ReceiptText, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import PassengerPanelModern from "./PassengerPanelModern";
import PassengerRidesPage from "./PassengerRidesPage";

export default function PassengerApp() {
  const [location, setLocation] = useLocation();
  const isProfile = location.includes("/profile");
  const isSecurity = location.includes("/security");
  const isRides = location.includes("/rides");

  return (
    <div className="min-h-screen bg-[#f3f3f3] pb-28 md:pb-0">
      {isProfile ? (
        <>
          <PremiumInternalHeader eyebrow="Taximun pasajero" title="Mi perfil" description="Gestiona tus datos, preferencias y configuración de cuenta." homePath="/passenger" icon={<UserRound className="h-8 w-8" />} />
          <TaxiProfileSettings role="passenger" />
        </>
      ) : isSecurity ? (
        <main className="min-h-screen bg-[#f3f3f3]">
          <PremiumInternalHeader eyebrow="Taximun pasajero" title="Seguridad" description="Registra incidencias reales y accede rápidamente a la ayuda." homePath="/passenger" icon={<ShieldCheck className="h-8 w-8" />} />
          <div className="mx-auto max-w-3xl px-4 py-6">
            <TaxiSupportActions role="passenger" />
          </div>
        </main>
      ) : isRides ? (
        <div className="min-h-screen bg-[#f3f3f3]">
          <PremiumInternalHeader eyebrow="Taximun pasajero" title="Mis viajes" description="Consulta el viaje activo, el historial, el conductor y los recibos." homePath="/passenger" icon={<ReceiptText className="h-8 w-8" />} />
          <PassengerDispatchStatus />
          <PassengerLiveTrackingSection />
          <PassengerPostTripRatingSection />
          <PassengerDriverPublicProfileSection />
          <PassengerRidesPage />
        </div>
      ) : (
        <div>
          <PassengerDispatchStatus />
          <PassengerCommandGrid />
          <PassengerSafeCancellationCard />
          <div className="passenger-panel-modern-shell">
            <PassengerPanelModern />
          </div>
        </div>
      )}
      <AppBottomNav
        items={[
          { label: "Inicio", active: !isProfile && !isSecurity && !isRides, icon: <Home className="h-6 w-6" />, onClick: () => setLocation("/passenger") },
          { label: "Viaje", active: isRides, icon: <Car className="h-6 w-6" />, onClick: () => setLocation("/passenger/rides") },
          { label: "Seguro", active: isSecurity, icon: <ShieldCheck className="h-6 w-6" />, onClick: () => setLocation("/passenger/security") },
          { label: "Perfil", active: isProfile, icon: <UserRound className="h-6 w-6" />, onClick: () => setLocation("/passenger/profile") },
        ]}
      />
    </div>
  );
}
