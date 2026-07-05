import { AppBottomNav } from "@/components/AppBottomNav";
import { Car, Home, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import DriverPanelModern from "./DriverPanelModern";

export default function DriverApp() {
  const [, setLocation] = useLocation();

  return (
    <div className="pb-24 md:pb-0">
      <DriverPanelModern />
      <AppBottomNav
        items={[
          { label: "Turno", active: true, icon: <Home className="h-5 w-5" />, onClick: () => setLocation("/driver") },
          { label: "Servicios", icon: <Car className="h-5 w-5" />, onClick: () => setLocation("/driver/queue") },
          { label: "Seguro", icon: <ShieldCheck className="h-5 w-5" />, onClick: () => setLocation("/driver") },
          { label: "Perfil", icon: <UserRound className="h-5 w-5" />, onClick: () => setLocation("/driver/profile") },
        ]}
      />
    </div>
  );
}
