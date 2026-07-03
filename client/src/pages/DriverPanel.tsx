import { useState, useEffect } from "react";
import { useI18nContext } from "@/contexts/I18nContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle, XCircle, MapPin, Clock, DollarSign, LogOut, Navigation, Loader2, Flag } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type DriverStatus = "available" | "busy" | "offline";

export default function DriverPanel() {
  const { t } = useI18nContext();
  const { logout } = useAuth();
  const [driverStatus, setDriverStatus] = useState<DriverStatus>("offline");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const utils = trpc.useUtils();
  const { data: driverProfile, isLoading: isLoadingProfile } = trpc.driver.getProfile.useQuery();
  const { data: queueData } = trpc.driver.getQueuePosition.useQuery(undefined, {
    enabled: driverStatus !== "offline",
  });
  const { data: pendingRide, isLoading: isLoadingPendingRide } = trpc.driver.getPendingRide.useQuery(undefined, {
    refetchInterval: driverStatus === "available" ? 5000 : false,
  });
  const { data: rideHistory } = trpc.driver.getRideHistory.useQuery();

  const setStatusMutation = trpc.driver.setStatus.useMutation({
    onSuccess: async () => {
      await utils.driver.getProfile.invalidate();
      await utils.driver.getQueuePosition.invalidate();
      toast.success(t.common.success);
    },
    onError: () => toast.error(t.common.error),
  });

  const updateLocationMutation = trpc.driver.updateLocation.useMutation();

  const acceptRideMutation = trpc.driver.acceptRide.useMutation({
    onSuccess: async () => {
      await utils.driver.getPendingRide.invalidate();
      await utils.driver.getProfile.invalidate();
      toast.success(t.driver.acceptService);
    },
    onError: () => toast.error(t.common.error),
  });

  const rejectRideMutation = trpc.driver.rejectRide.useMutation({
    onSuccess: async () => {
      await utils.driver.getPendingRide.invalidate();
      toast.success(t.driver.rejectService);
    },
    onError: () => toast.error(t.common.error),
  });

  const completeRideMutation = trpc.driver.completeRide.useMutation({
    onSuccess: async () => {
      await utils.driver.getPendingRide.invalidate();
      await utils.driver.getProfile.invalidate();
      await utils.driver.getRideHistory.invalidate();
      toast.success(t.common.success);
    },
    onError: () => toast.error(t.common.error),
  });

  useEffect(() => {
    if (driverProfile?.status) {
      setDriverStatus(driverProfile.status as DriverStatus);
    }
  }, [driverProfile?.status]);

  // Get and update driver's current location when the driver is online
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setUserLocation(nextLocation);

        if (driverStatus !== "offline") {
          updateLocationMutation.mutate({
            lat: nextLocation.latitude,
            lng: nextLocation.longitude,
          });
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driverStatus]);

  const handleStatusChange = async (status: DriverStatus) => {
    setDriverStatus(status);
    await setStatusMutation.mutateAsync({ status });
  };

  const handleAcceptService = async () => {
    if (!pendingRide?.id) return;
    await acceptRideMutation.mutateAsync({ rideId: pendingRide.id });
  };

  const handleRejectService = async () => {
    if (!pendingRide?.id) return;
    await rejectRideMutation.mutateAsync({ rideId: pendingRide.id });
  };

  const handleCompleteRide = async () => {
    if (!pendingRide?.id) return;

    await completeRideMutation.mutateAsync({
      rideId: pendingRide.id,
      actualFare: Number(pendingRide.estimated_fare ?? 0),
      actualDuration: Number(pendingRide.estimated_duration ?? 0),
    });
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

  const queuePosition = queueData?.position ?? null;
  const totalInQueue = queueData?.totalInQueue ?? 0;
  const todayEarnings = Number(driverProfile?.total_earnings ?? 0);
  const totalTrips = Number(driverProfile?.total_rides ?? 0);
  const isRideActionPending = acceptRideMutation.isPending || rejectRideMutation.isPending || completeRideMutation.isPending;

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/5">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto" />
          <p className="text-lg text-muted-foreground">{t.common.loading}</p>
        </div>
      </div>
    );
  }

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
                  <Select
                    value={driverStatus}
                    onValueChange={(value) => handleStatusChange(value as DriverStatus)}
                    disabled={setStatusMutation.isPending}
                  >
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
                        style={{ width: `${totalInQueue > 0 ? (queuePosition / totalInQueue) * 100 : 0}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    {driverStatus === "offline" ? t.driver.offline : t.driver.waitingTime}
                  </p>
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
        {isLoadingPendingRide && driverStatus !== "offline" && (
          <div className="mt-6">
            <Alert className="border-border/50 bg-muted/30">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription className="ml-2">{t.common.loading}</AlertDescription>
            </Alert>
          </div>
        )}

        {pendingRide && (
          <div className="mt-6">
            <Alert className="border-accent/50 bg-accent/5">
              <AlertCircle className="h-4 w-4 text-accent" />
              <AlertDescription className="ml-2">
                {pendingRide.status === "in_progress" ? t.passenger.trackingRide : t.driver.nextService}
              </AlertDescription>
            </Alert>

            <Card className="mt-4 shadow-lg border-border/50 border-accent/50">
              <CardHeader className="bg-accent/5">
                <CardTitle>{t.driver.serviceDetails}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{t.driver.passenger}</label>
                  <p className="text-foreground">
                    {t.driver.passenger} · ⭐ {pendingRide.passenger?.rating?.toFixed?.(1) ?? "--"}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent" />
                    {t.driver.pickupAddress}
                  </label>
                  <p className="text-foreground text-sm">
                    {Number(pendingRide.pickup_lat).toFixed(4)}, {Number(pendingRide.pickup_lng).toFixed(4)}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-secondary" />
                    {t.driver.dropoffAddress}
                  </label>
                  <p className="text-foreground text-sm">
                    {Number(pendingRide.dropoff_lat).toFixed(4)}, {Number(pendingRide.dropoff_lng).toFixed(4)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-xs text-muted-foreground">{t.booking.estimatedFare}</span>
                    <span className="font-semibold">€{Number(pendingRide.estimated_fare ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-xs text-muted-foreground">{t.booking.estimatedTime}</span>
                    <span className="font-semibold">{pendingRide.estimated_duration ?? "--"} min</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  {pendingRide.status === "assigned" && (
                    <>
                      <Button
                        onClick={handleAcceptService}
                        disabled={isRideActionPending}
                        className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t.driver.acceptService}
                      </Button>
                      <Button
                        onClick={handleRejectService}
                        disabled={isRideActionPending}
                        variant="outline"
                        className="flex-1 gap-2 border-red-200 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                        {t.driver.rejectService}
                      </Button>
                    </>
                  )}

                  {pendingRide.status === "in_progress" && (
                    <Button
                      onClick={handleCompleteRide}
                      disabled={isRideActionPending}
                      className="w-full bg-accent hover:bg-accent/90 gap-2"
                    >
                      <Flag className="w-4 h-4" />
                      {t.common.done}
                    </Button>
                  )}
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
                  {pendingRide ? (
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">{pendingRide.status}</span>
                        <span className="text-xs text-muted-foreground">
                          €{Number(pendingRide.estimated_fare ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {Number(pendingRide.pickup_lat).toFixed(4)}, {Number(pendingRide.pickup_lng).toFixed(4)} → {Number(pendingRide.dropoff_lat).toFixed(4)}, {Number(pendingRide.dropoff_lng).toFixed(4)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">{t.common.noData}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <Card className="border-border/50">
                <CardContent className="pt-6">
                  {rideHistory && rideHistory.length > 0 ? (
                    <div className="space-y-3">
                      {rideHistory.slice(0, 8).map((ride) => (
                        <div key={ride.id} className="p-3 bg-muted rounded-lg text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-foreground">{ride.status}</span>
                            <span className="text-xs text-muted-foreground">€{Number(ride.actual_fare ?? 0).toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {ride.completed_at ? new Date(ride.completed_at).toLocaleDateString() : "--"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">{t.common.noData}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
