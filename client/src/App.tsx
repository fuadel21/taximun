import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { GlobalNotificationDock } from "./components/GlobalNotificationDock";
import { AdminUrgentAlertDock } from "./components/AdminUrgentAlertDock";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AuthReal from "./pages/AuthReal";
import TestHub from "./pages/TestHub";
import NotificationsPage from "./pages/NotificationsPage";
import PassengerApp from "./pages/PassengerApp";
import PassengerProfile from "./pages/PassengerProfile";
import DriverApp from "./pages/DriverApp";
import DriverProfile from "./pages/DriverProfile";
import AdminPanel from "./pages/AdminPanel";
import AdminSafetyPage from "./pages/AdminSafetyPage";
import AdminAlertsPanel from "./pages/AdminAlertsPanel";
import AdminVerificationPage from "./pages/AdminVerificationPage";
import AdminSystemHealthPage from "./pages/AdminSystemHealthPage";
import AdminJourneyValidationPage from "./pages/AdminJourneyValidationPage";
import AdminOperationsPage from "./pages/AdminOperationsPage";
import SharedTripTrackingPage from "./pages/SharedTripTrackingPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/auth"} component={AuthReal} />
      <Route path={"/test"} component={TestHub} />
      <Route path={"/notifications"} component={NotificationsPage} />
      <Route path={"/track/:token"} component={SharedTripTrackingPage} />
      {/* Passenger routes */}
      <Route path={"/passenger"} component={PassengerApp} />
      <Route path={"/passenger/rides"} component={PassengerApp} />
      <Route path={"/passenger/book"} component={PassengerApp} />
      <Route path={"/passenger/security"} component={PassengerApp} />
      <Route path={"/passenger/profile"} component={PassengerProfile} />
      {/* Driver routes */}
      <Route path={"/driver"} component={DriverApp} />
      <Route path={"/driver/queue"} component={DriverApp} />
      <Route path={"/driver/navigation"} component={DriverApp} />
      <Route path={"/driver/earnings"} component={DriverApp} />
      <Route path={"/driver/security"} component={DriverApp} />
      <Route path={"/driver/profile"} component={DriverProfile} />
      {/* Admin routes */}
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/admin/dashboard"} component={AdminPanel} />
      <Route path={"/admin/operations"} component={AdminOperationsPage} />
      <Route path={"/admin/users"} component={AdminPanel} />
      <Route path={"/admin/verification"} component={AdminVerificationPage} />
      <Route path={"/admin/safety"} component={AdminSafetyPage} />
      <Route path={"/admin/health"} component={AdminSystemHealthPage} />
      <Route path={"/admin/journey-test"} component={AdminJourneyValidationPage} />
      <Route path={"/admin/alerts"} component={AdminAlertsPanel} />
      <Route path={"/admin/incidents"} component={AdminAlertsPanel} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <GlobalNotificationDock />
          <AdminUrgentAlertDock />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
