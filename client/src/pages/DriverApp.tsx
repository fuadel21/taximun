import { AppBottomNav, driverNavItems } from "@/components/AppBottomNav";
import DriverPanelModern from "./DriverPanelModern";

export default function DriverApp() {
  return (
    <div className="pb-24 md:pb-0">
      <DriverPanelModern />
      <AppBottomNav items={driverNavItems("home")} />
    </div>
  );
}
