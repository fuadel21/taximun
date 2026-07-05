import { AppBottomNav } from "@/components/AppBottomNav";
import { TaxiProfileSettings } from "@/components/TaxiProfileSettings";
import { Car, Clock3, Home, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import PassengerPanelModern from "./PassengerPanelModern";

export default function PassengerApp() {
  const [location, setLocation] = useLocation();
  const isProfile = location.includes("/profile");

  return (
    <div className="pb-24 md:pb-0">
      {isProfile ? <TaxiProfileSettings role="passenger" /> : <PassengerPanelModern />}
      <AppBottomNav
        items={[
          { label: "Inicio", active: !isProfile, icon: <Home className="h-5 w-5" />, onClick: () => setLocation("/passenger") },
          { label: "Viaje", icon: <Car className="h-5 w-5" />, onClick: () => setLocation("/passenger") },
          { label: "Seguro", icon: <ShieldCheck className="h-5 w-5" />, onClick: () => setLocation("/passenger") },
          { label: "Perfil", active: isProfile, icon: <Clock3 className="h-5 w-5" />, onClick: () => setLocation("/passenger/profile") },
        ]}
      />
    </div>
  );
}
