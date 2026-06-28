import { useState, useEffect } from "react";
import { useI18nContext } from "@/contexts/I18nContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle, XCircle, MapPin, Clock, DollarSign, LogOut, Navigation } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PendingService {
  id: number;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFare: number;
  estimatedDuration: number;
}

export default function DriverPanel() {
  const { t } = useI18nContext();
  const { user, logout } = useAuth();
  const [driverStatus, setDriverStatus] = useState<"available" | "busy" | "offline">("offline");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [totalInQueue, setTotalInQueue] = useState(0);
  const [pendingService, setPendingService] = useState<PendingService | null>(null);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => console.error("Geolocation error:", error)
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  const handleStatusChange = (status: "available" | "busy" | "offline") => {
    setDriverStatus(status);
    // TODO: Call tRPC to update driver status
  };

  const handleAcceptService = () => {
    if (!pendingService) return;
    // TODO: Call tRPC to accept service
    setPendingService(null);
  };

  const handleRejectService = () => {
    if (!pendingService) return;
    // TODO: Call tRPC to reject service
    setPendingService(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800";
      case "busy":
        return "bg-orange-100 text-orange-800";
      case "offline":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b border-border/50 shadow-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Taximun</h1>
            <p className="text-sm text-muted-foreground">{t.driver.driverPanel}</p>
          </div>
          <Button variant="outline" onClick={logout} className="gap-2">
            <LogOut className="w-4 h-4" />
            {t.nav.logout}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-accent" />
                  {t.map.map}
                </CardTitle>
                <CardDescription>{t.driver.updateStatus}</CardDescription>
              </CardHeader>
              <CardContent className="p-0 rounded-lg overflow-hidden">
                <TaxiMap userLocation={userLocation || undefined} readOnly />
              </CardContent>
            </Card>
          </div>

          {/* Driver Status Panel */}
          <div className="space-y-4">
            {/* Status Card */}
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle>{t.driver.status}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{t.driver.updateStatus}</label>
                  <Select value={driverStatus} onValueChange={handleStatusChange}>
                    <SelectTrigger className="border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">{t.driver.available}</SelectItem>
                      <SelectItem value="busy">{t.driver.busy}</SelectItem>
                      <SelectItem value="offline">{t.driver.offline}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">{t.common.status}</span>
                  <Badge className={getStatusColor(driverStatus)}>
                    {driverStatus === "available"
                      ? t.driver.available
                      : driverStatus === "busy"
                        ? t.driver.busy
                        : t.driver.offline}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Queue Position */}
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-secondary" />
                  {t.driver.queuePosition}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {queuePosition ? (
                  <>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-accent">{queuePosition}</p>
                      <p className="text-sm text-muted-foreground">de {totalInQueue}</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-accent h-2 rounded-full transition-all"
                        style={{ width: `${(queuePosition / totalInQueue) * 100}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">{t.driver.waitingTime}</p>
                )}
              </CardContent>
            </Card>

            {/* Earnings */}
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  {t.driver.earnings}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">{t.driver.todayEarnings}</span>
                  <span className="font-bold text-foreground">€{todayEarnings.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">{t.driver.trips}</span>
                  <span className="font-bold text-foreground">{totalTrips}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Pending Service Alert */}
        {pendingService && (
          <div className="mt-6">
            <Alert className="border-accent/50 bg-accent/5">
              <AlertCircle className="h-4 w-4 text-accent" />
              <AlertDescription className="ml-2">{t.driver.nextService}</AlertDescription>
            </Alert>

            <Card className="mt-4 shadow-lg border-border/50 border-accent/50">
              <CardHeader className="bg-accent/5">
                <CardTitle>{t.driver.serviceDetails}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{t.driver.passenger}</label>
                  <p className="text-foreground">{pendingService.passengerName}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent" />
                    {t.driver.pickupAddress}
                  </label>
                  <p className="text-foreground text-sm">{pendingService.pickupAddress}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-secondary" />
                    {t.driver.dropoffAddress}
                  </label>
                  <p className="text-foreground text-sm">{pendingService.dropoffAddress}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-xs text-muted-foreground">{t.booking.estimatedFare}</span>
                    <span className="font-semibold">€{pendingService.estimatedFare.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-xs text-muted-foreground">{t.booking.estimatedTime}</span>
                    <span className="font-semibold">{pendingService.estimatedDuration} min</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleAcceptService}
                    className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {t.driver.acceptService}
                  </Button>
                  <Button
                    onClick={handleRejectService}
                    variant="outline"
                    className="flex-1 gap-2 border-red-200 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 text-red-600" />
                    {t.driver.rejectService}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Ride History */}
        <div className="mt-6">
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active">{t.admin.activeRides}</TabsTrigger>
              <TabsTrigger value="history">{t.driver.rideHistory}</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4">
              <Card className="border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">{t.common.noData}</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <Card className="border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">{t.common.noData}</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
