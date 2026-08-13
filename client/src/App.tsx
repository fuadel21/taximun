import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { GlobalNotificationDock } from "./components/GlobalNotificationDock";
import { AdminUrgentAlertDock } from "./components/AdminUrgentAlertDock";
import { AdminPremiumShell } from "./components/AdminPremiumShell";
import { RoleRouteGuard } from "./components/RoleRouteGuard";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AuthReal from "./pages/AuthReal";
import NotificationsPage from "./pages/NotificationsPage";
import PassengerApp from "./pages/PassengerApp";
import DriverApp from "./pages/DriverApp";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminFinancePage from "./pages/AdminFinancePage";
import AdminResourcesPage from "./pages/AdminResourcesPage";
import AdminSafetyPage from "./pages/AdminSafetyPage";
import AdminAlertsPanel from "./pages/AdminAlertsPanel";
import AdminVerificationPage from "./pages/AdminVerificationPage";
import AdminSystemHealthPage from "./pages/AdminSystemHealthPage";
import AdminJourneyValidationPage from "./pages/AdminJourneyValidationPage";
import AdminOperationsCenterPage from "./pages/AdminOperationsCenterPage";
import AdminPromotionsPage from "./pages/AdminPromotionsPage";
import SharedTripTrackingPage from "./pages/SharedTripTrackingPage";

const passenger = (node: ReactNode) => <RoleRouteGuard allowed={["passenger", "admin"]}>{node}</RoleRouteGuard>;
const driver = (node: ReactNode) => <RoleRouteGuard allowed={["driver", "admin"]}>{node}</RoleRouteGuard>;
const admin = (node: ReactNode) => <RoleRouteGuard allowed={["admin"]}>{node}</RoleRouteGuard>;
const signedIn = (node: ReactNode) => <RoleRouteGuard allowed={["passenger", "driver", "admin"]}>{node}</RoleRouteGuard>;
const adminInternal = (node: ReactNode) => admin(<AdminPremiumShell>{node}</AdminPremiumShell>);

function Router() {
  return <Switch>
    <Route path="/" component={Home} /><Route path="/auth" component={AuthReal} /><Route path="/track/:token" component={SharedTripTrackingPage} />
    <Route path="/notifications">{signedIn(<NotificationsPage />)}</Route>
    <Route path="/passenger">{passenger(<PassengerApp />)}</Route><Route path="/passenger/rides">{passenger(<PassengerApp />)}</Route><Route path="/passenger/book">{passenger(<PassengerApp />)}</Route><Route path="/passenger/security">{passenger(<PassengerApp />)}</Route><Route path="/passenger/profile">{passenger(<PassengerApp />)}</Route>
    <Route path="/driver">{driver(<DriverApp />)}</Route><Route path="/driver/queue">{driver(<DriverApp />)}</Route><Route path="/driver/navigation">{driver(<DriverApp />)}</Route><Route path="/driver/earnings">{driver(<DriverApp />)}</Route><Route path="/driver/security">{driver(<DriverApp />)}</Route><Route path="/driver/profile">{driver(<DriverApp />)}</Route>
    <Route path="/admin">{admin(<AdminDashboardPage />)}</Route><Route path="/admin/dashboard">{admin(<AdminDashboardPage />)}</Route><Route path="/admin/operations">{adminInternal(<AdminOperationsCenterPage />)}</Route><Route path="/admin/finance">{adminInternal(<AdminFinancePage />)}</Route><Route path="/admin/users">{adminInternal(<AdminResourcesPage />)}</Route><Route path="/admin/resources">{adminInternal(<AdminResourcesPage />)}</Route><Route path="/admin/verification">{adminInternal(<AdminVerificationPage />)}</Route><Route path="/admin/safety">{adminInternal(<AdminSafetyPage />)}</Route><Route path="/admin/health">{adminInternal(<AdminSystemHealthPage />)}</Route><Route path="/admin/journey-test">{adminInternal(<AdminJourneyValidationPage />)}</Route><Route path="/admin/alerts">{adminInternal(<AdminAlertsPanel />)}</Route><Route path="/admin/incidents">{adminInternal(<AdminAlertsPanel />)}</Route><Route path="/admin/promotions">{adminInternal(<AdminPromotionsPage />)}</Route>
    <Route path="/404" component={NotFound} /><Route component={NotFound} />
  </Switch>;
}

function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /><GlobalNotificationDock /><AdminUrgentAlertDock /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
export default App;
