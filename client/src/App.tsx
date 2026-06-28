import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import PassengerPanel from "./pages/PassengerPanel";
import DriverPanel from "./pages/DriverPanel";
import AdminPanel from "./pages/AdminPanel";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/auth"} component={Auth} />
      {/* Passenger routes */}
      <Route path={"/passenger"} component={PassengerPanel} />
      <Route path={"/passenger/rides"} component={() => <div>My Rides - Coming Soon</div>} />
      <Route path={"/passenger/book"} component={() => <div>Book Taxi - Coming Soon</div>} />
      {/* Driver routes */}
      <Route path={"/driver"} component={DriverPanel} />
      <Route path={"/driver/queue"} component={() => <div>Queue Position - Coming Soon</div>} />
      <Route path={"/driver/earnings"} component={() => <div>Earnings - Coming Soon</div>} />
      {/* Admin routes */}
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/admin/dashboard"} component={() => <div>Dashboard - Coming Soon</div>} />
      <Route path={"/admin/users"} component={() => <div>Users Management - Coming Soon</div>} />
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
