import { AppBottomNav, passengerNavItems } from "@/components/AppBottomNav";
import PassengerPanelModern from "./PassengerPanelModern";

export default function PassengerApp() {
  return (
    <div className="pb-24 md:pb-0">
      <PassengerPanelModern />
      <AppBottomNav items={passengerNavItems("home")} />
    </div>
  );
}
