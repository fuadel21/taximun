import { AppBottomNav } from "@/components/AppBottomNav";
import { PassengerCommandGrid } from "@/components/PassengerCommandGrid";
import { PassengerDispatchStatus } from "@/components/PassengerDispatchStatus";
import { PassengerDriverPublicProfileSection } from "@/components/PassengerDriverPublicProfileSection";
import { PassengerLiveTrackingSection } from "@/components/PassengerLiveTrackingSection";
import { PassengerPostTripRatingSection } from "@/components/PassengerPostTripRatingSection";
import { TaxiProfileSettings } from "@/components/TaxiProfileSettings";
import { TaxiSupportActions } from "@/components/TaxiSupportActions";
import { Car, Clock3, Home, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import PassengerPanelModern from "./PassengerPanelModern";
import PassengerRidesPage from "./PassengerRidesPage";

export default function PassengerApp() {
  const [location, setLocation] = useLocation();
  const isProfile = location.includes("/profile");
  const isSecurity = location.includes("/security");
  const isRides = location.includes("/rides");

  return (
    <div className="pb-36 md:pb-0">
      {isProfile ? (
        <TaxiProfileSettings role="passenger" />
      ) : isSecurity ? (
        <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-700">Taximun</p>
              <h1 className="text-3xl font-black">Seguridad pasajero</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">Registra incidencias reales para revisión del administrador.</p>
            </div>
            <TaxiSupportActions role="passenger" />
          </div>
        </main>
      ) : isRides ? (
        <div className="min-h-screen bg-[#f7f8fb]">
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
          <PassengerPanelModern />
        </div>
      )}
      <AppBottomNav
        items={[
          { label: "Inicio", active: !isProfile && !isSecurity && !isRides, icon: <Home className="h-6 w-6" />, onClick: () => setLocation("/passenger") },
          { label: "Viaje", active: isRides, icon: <Car className="h-6 w-6" />, onClick: () => setLocation("/passenger/rides") },
          { label: "Seguro", active: isSecurity, icon: <ShieldCheck className="h-6 w-6" />, onClick: () => setLocation("/passenger/security") },
          { label: "Perfil", active: isProfile, icon: <Clock3 className="h-6 w-6" />, onClick: () => setLocation("/passenger/profile") },
        ]}
      />
    </div>
  );
}
