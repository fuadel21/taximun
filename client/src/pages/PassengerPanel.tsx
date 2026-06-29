import { useEffect, useState } from "react";
import { useI18nContext } from "@/contexts/I18nContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Clock, DollarSign, Star, LogOut, Loader2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function PassengerPanel() {
  const { t } = useI18nContext();
  const { user, logout } = useAuth();
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [step, setStep] = useState<"pickup" | "dropoff" | "confirm">("pickup");
  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setPickupLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
          toast.error(t.common.error);
        }
      );
    }
  }, []);

  // Estimate fare when both locations are selected
  useEffect(() => {
    if (pickupLocation && dropoffLocation && step === "confirm") {
      const estimateFareQuery = trpc.public.estimateFare.useQuery({
        pickupLat: pickupLocation.lat,
        pickupLng: pickupLocation.lng,
        dropoffLat: dropoffLocation.lat,
        dropoffLng: dropoffLocation.lng,
      });

      if (estimateFareQuery.data) {
        setEstimatedFare(estimateFareQuery.data.fare);
        setEstimatedDuration(estimateFareQuery.data.duration);
      }
    }
  }, [pickupLocation, dropoffLocation, step]);

  // Queries and mutations
  const createRideMutation = trpc.passenger.createRide.useMutation();
  const { data: currentRide, isLoading: isLoadingCurrentRide } = trpc.passenger.getCurrentRide.useQuery();
  const { data: rideHistory } = trpc.passenger.getRideHistory.useQuery();

  const handlePickupSelect = (lat: number, lng: number) => {
    setPickupLocation({ lat, lng });
    setStep("dropoff");
  };

  const handleDropoffSelect = (lat: number, lng: number) => {
    setDropoffLocation({ lat, lng });
    setStep("confirm");
  };

  const handleConfirmBooking = async () => {
    if (!pickupLocation || !dropoffLocation || !estimatedFare || !estimatedDuration) return;

    try {
      await createRideMutation.mutateAsync({
        pickupLat: pickupLocation.lat,
        pickupLng: pickupLocation.lng,
        dropoffLat: dropoffLocation.lat,
        dropoffLng: dropoffLocation.lng,
        estimatedFare,
        estimatedDuration,
      });

      toast.success(t.booking.rideConfirmed);
      setStep("pickup");
      setPickupLocation(null);
      setDropoffLocation(null);
      setEstimatedFare(null);
      setEstimatedDuration(null);
    } catch (error) {
      console.error("Error creating ride:", error);
      toast.error(t.common.error);
    }
  };

  // Show current ride tracking if exists
  if (currentRide) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-accent/5">
        {/* Header */}
        <header className="bg-card border-b border-border/50 shadow-sm sticky top-0 z-10">
          <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Taximun</h1>
              <p className="text-sm text-muted-foreground">{t.passenger.trackingRide}</p>
            </div>
            <Button variant="outline" onClick={logout} className="gap-2">
              <LogOut className="w-4 h-4" />
              {t.nav.logout}
            </Button>
          </div>
        </header>

        <main className="container max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map with tracking */}
            <div className="lg:col-span-2">
              <Card className="shadow-lg border-border/50">
                <CardHeader>
                  <CardTitle>{t.map.map}</CardTitle>
                  <CardDescription>{t.passenger.trackingDriver}</CardDescription>
                </CardHeader>
                <CardContent className="p-0 rounded-lg overflow-hidden">
                  <TaxiMap readOnly userLocation={userLocation || undefined} />
                </CardContent>
              </Card>
            </div>

            {/* Ride Details */}
            <div className="space-y-4">
              <Card className="shadow-lg border-border/50">
                <CardHeader>
                  <CardTitle>{t.passenger.rideDetails}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Driver Info */}
                  {currentRide.driver && (
                    <div className="p-4 bg-accent/10 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">{t.passenger.driver}</span>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-semibold">{currentRide.driver.rating?.toFixed(1)}</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{t.passenger.waitingForDriver}</p>
                    </div>
                  )}

                  {/* Locations */}
                  <div className="space-y-3 pt-4 border-t border-border/50">
                    <div className="flex gap-2">
                      <MapPin className="w-4 h-4 text-accent flex-shrink-0 mt-1" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{t.booking.pickupLocation}</p>
                        <p className="text-sm font-semibold text-foreground">
                          {currentRide.pickup_lat?.toFixed(4)}, {currentRide.pickup_lng?.toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <MapPin className="w-4 h-4 text-secondary flex-shrink-0 mt-1" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{t.booking.dropoffLocation}</p>
                        <p className="text-sm font-semibold text-foreground">
                          {currentRide.dropoff_lat?.toFixed(4)}, {currentRide.dropoff_lng?.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Fare Info */}
                  <div className="space-y-2 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        {t.booking.estimatedTime}
                      </span>
                      <span className="font-semibold text-foreground">~{currentRide.estimated_duration} {t.booking.minutes}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        {t.booking.estimatedFare}
                      </span>
                      <span className="font-semibold text-foreground">€{currentRide.estimated_fare?.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
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
            <p className="text-sm text-muted-foreground">{t.passenger.passengerPanel}</p>
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
                <CardTitle>{t.map.map}</CardTitle>
                <CardDescription>
                  {step === "pickup"
                    ? t.booking.pickupLocation
                    : step === "dropoff"
                      ? t.booking.dropoffLocation
                      : t.booking.confirmBooking}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 rounded-lg overflow-hidden">
                <TaxiMap
                  userLocation={userLocation || undefined}
                  onLocationSelect={step === "pickup" ? handlePickupSelect : handleDropoffSelect}
                />
              </CardContent>
            </Card>
          </div>

          {/* Booking Panel */}
          <div className="space-y-4">
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle>{t.booking.bookTaxi}</CardTitle>
                <CardDescription>{t.booking.estimatedFare}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Step Indicator */}
                <div className="flex gap-2">
                  <div
                    className={`flex-1 h-1 rounded-full transition-colors ${
                      step !== "pickup" ? "bg-accent" : "bg-muted"
                    }`}
                  />
                  <div
                    className={`flex-1 h-1 rounded-full transition-colors ${
                      step === "confirm" ? "bg-accent" : "bg-muted"
                    }`}
                  />
                </div>

                {/* Pickup Location */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent" />
                    {t.booking.pickupLocation}
                  </Label>
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    {pickupLocation ? (
                      <p className="text-foreground">
                        {pickupLocation.lat.toFixed(4)}, {pickupLocation.lng.toFixed(4)}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">{t.booking.selectOnMap}</p>
                    )}
                  </div>
                </div>

                {/* Dropoff Location */}
                {step !== "pickup" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-secondary" />
                      {t.booking.dropoffLocation}
                    </Label>
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      {dropoffLocation ? (
                        <p className="text-foreground">
                          {dropoffLocation.lat.toFixed(4)}, {dropoffLocation.lng.toFixed(4)}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">{t.booking.selectOnMap}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Estimated Info */}
                {step === "confirm" && (
                  <div className="space-y-2 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        {t.booking.estimatedTime}
                      </span>
                      <span className="font-semibold text-foreground">~{estimatedDuration} {t.booking.minutes}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        {t.booking.estimatedFare}
                      </span>
                      <span className="font-semibold text-foreground">€{estimatedFare?.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-4 space-y-2">
                  {step !== "pickup" && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setStep(step === "dropoff" ? "pickup" : "dropoff")}
                      disabled={createRideMutation.isPending}
                    >
                      {t.common.back}
                    </Button>
                  )}
                  {step === "confirm" && (
                    <Button
                      className="w-full bg-accent hover:bg-accent/90 gap-2"
                      onClick={handleConfirmBooking}
                      disabled={createRideMutation.isPending}
                    >
                      {createRideMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {t.booking.confirmBooking}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Tabs defaultValue="history" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="history">{t.passenger.rideHistory}</TabsTrigger>
                <TabsTrigger value="favorites">{t.passenger.myFavorites}</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="mt-4">
                <Card className="border-border/50">
                  <CardContent className="pt-6">
                    {rideHistory && rideHistory.length > 0 ? (
                      <div className="space-y-3">
                        {rideHistory.slice(0, 5).map((ride) => (
                          <div key={ride.id} className="p-3 bg-muted rounded-lg text-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-foreground">{ride.status}</span>
                              <span className="text-xs text-muted-foreground">€{ride.actual_fare?.toFixed(2)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(ride.created_at).toLocaleDateString()}
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

              <TabsContent value="favorites" className="mt-4">
                <Card className="border-border/50">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground text-center">{t.common.noData}</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
