import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AuthReal from "./pages/AuthReal";
import TestHub from "./pages/TestHub";
import PassengerApp from "./pages/PassengerApp";
import PassengerProfile from "./pages/PassengerProfile";
import DriverApp from "./pages/DriverApp";
import DriverProfile from "./pages/DriverProfile";
import AdminPanel from "./pages/AdminPanel";
import AdminSupportPage from "./pages/AdminSupportPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/auth"} component={AuthReal} />
      <Route path={"/test"} component={TestHub} />
      {/* Passenger routes */}
      <Route path={"/passenger"} component={PassengerApp} />
      <Route path={"/passenger/rides"} component={PassengerApp} />
      <Route path={"/passenger/book"} component={PassengerApp} />
      <Route path={"/passenger/profile"} component={PassengerProfile} />
      {/* Driver routes */}
      <Route path={"/driver"} component={DriverApp} />
      <Route path={"/driver/queue"} component={DriverApp} />
      <Route path={"/driver/earnings"} component={DriverApp} />
      <Route path={"/driver/profile"} component={DriverProfile} />
      {/* Admin routes */}
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/admin/dashboard"} component={AdminPanel} />
      <Route path={"/admin/users"} component={AdminPanel} />
      <Route path={"/admin/safety"} component={AdminSupportPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
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
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
