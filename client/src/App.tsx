import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import TestHub from "./pages/TestHub";
import PassengerPanel from "./pages/PassengerPanel";
import DriverPanel from "./pages/DriverPanel";
import AdminPanel from "./pages/AdminPanel";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/auth"} component={Auth} />
      <Route path={"/test"} component={TestHub} />
      {/* Passenger routes */}
      <Route path={"/passenger"} component={PassengerPanel} />
      <Route path={"/passenger/rides"} component={PassengerPanel} />
      <Route path={"/passenger/book"} component={PassengerPanel} />
      {/* Driver routes */}
      <Route path={"/driver"} component={DriverPanel} />
      <Route path={"/driver/queue"} component={DriverPanel} />
      <Route path={"/driver/earnings"} component={DriverPanel} />
      {/* Admin routes */}
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/admin/dashboard"} component={AdminPanel} />
      <Route path={"/admin/users"} component={AdminPanel} />
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
