import { AppBottomNav } from "@/components/AppBottomNav";
import { TaxiProfileSettings } from "@/components/TaxiProfileSettings";
import { Car, Home, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import DriverPanelModern from "./DriverPanelModern";

export default function DriverApp() {
  const [location, setLocation] = useLocation();
  const isProfile = location.includes("/profile");

  return (
    <div className="pb-24 md:pb-0">
      {isProfile ? <TaxiProfileSettings role="driver" /> : <DriverPanelModern />}
      <AppBottomNav
        items={[
          { label: "Turno", active: !isProfile, icon: <Home className="h-5 w-5" />, onClick: () => setLocation("/driver") },
          { label: "Servicios", icon: <Car className="h-5 w-5" />, onClick: () => setLocation("/driver/queue") },
          { label: "Seguro", icon: <ShieldCheck className="h-5 w-5" />, onClick: () => setLocation("/driver") },
          { label: "Perfil", active: isProfile, icon: <UserRound className="h-5 w-5" />, onClick: () => setLocation("/driver/profile") },
        ]}
      />
    </div>
  );
}
