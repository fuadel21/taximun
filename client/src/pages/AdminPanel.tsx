import { useMemo, useState } from "react";
import { useI18nContext } from "@/contexts/I18nContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Users,
  Car,
  TrendingUp,
  DollarSign,
  LogOut,
  Search,
  Filter,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CHART_COLORS = ["#1e40af", "#7c3aed", "#f59e0b", "#10b981", "#6b7280"];

type AdminUserRow = {
  id: string;
  name: string;
  role: "driver" | "passenger";
  contact: string;
  status: string;
};

type TaxiStatus = "available" | "maintenance" | "retired";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function AdminPanel() {
  const { t } = useI18nContext();
  const { logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const utils = trpc.useUtils();
  const { data: stats, isLoading: isLoadingStats } = trpc.admin.getStats.useQuery();
  const { data: drivers, isLoading: isLoadingDrivers } = trpc.admin.getAllDrivers.useQuery();
  const { data: passengers, isLoading: isLoadingPassengers } = trpc.admin.getAllPassengers.useQuery();
  const { data: taxis, isLoading: isLoadingTaxis } = trpc.admin.getAllTaxis.useQuery();
  const { data: recentRides, isLoading: isLoadingRides } = trpc.admin.getRecentRides.useQuery();

  const updateTaxiStatusMutation = trpc.admin.updateTaxiStatus.useMutation({
    onSuccess: async () => {
      await utils.admin.getAllTaxis.invalidate();
      toast.success(t.common.success);
    },
    onError: () => toast.error(t.common.error),
  });

  const isLoading = isLoadingStats || isLoadingDrivers || isLoadingPassengers || isLoadingTaxis || isLoadingRides;

  const users = useMemo<AdminUserRow[]>(() => {
    const driverRows = (drivers || []).map((driver) => ({
      id: String(driver.id),
      name: `${t.driver.passenger.replace(t.driver.passenger, t.driver.driverPanel)} ${String(driver.id).slice(0, 8)}`,
      role: "driver" as const,
      contact: driver.user?.phone_number || driver.user?.id || "--",
      status: driver.status || "--",
    }));

    const passengerRows = (passengers || []).map((passenger) => ({
      id: String(passenger.id),
      name: `${t.passenger.passengerPanel} ${String(passenger.id).slice(0, 8)}`,
      role: "passenger" as const,
      contact: passenger.user?.phone_number || passenger.user?.id || "--",
      status: "active",
    }));

    return [...driverRows, ...passengerRows];
  }, [drivers, passengers, t.driver.driverPanel, t.driver.passenger, t.passenger.passengerPanel]);

  const filteredUsers = users.filter((user) => {
    const query = searchTerm.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.contact.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query) ||
      user.status.toLowerCase().includes(query)
    );
  });

  const weeklyRidesData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        date,
        label: date.toLocaleDateString("es-ES", { weekday: "short" }),
        rides: 0,
        revenue: 0,
      };
    });

    (recentRides || []).forEach((ride) => {
      if (!ride.created_at) return;
      const rideDate = new Date(ride.created_at);
      const day = days.find((item) => item.date.toDateString() === rideDate.toDateString());
      if (!day) return;
      day.rides += 1;
      day.revenue += Number(ride.actual_fare || ride.estimated_fare || 0);
    });

    return days.map(({ label, rides, revenue }) => ({
      date: label,
      rides,
      revenue: Math.round(revenue * 100) / 100,
    }));
  }, [recentRides]);

  const statusData = useMemo(() => {
    const driverList = drivers || [];
    const counts = driverList.reduce(
      (acc, driver) => {
        const status = driver.status || "offline";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return [
      { name: t.driver.available, value: counts.available || 0, color: CHART_COLORS[3] },
      { name: t.driver.busy, value: counts.busy || 0, color: CHART_COLORS[2] },
      { name: t.driver.offline, value: counts.offline || 0, color: CHART_COLORS[4] },
    ];
  }, [drivers, t.driver.available, t.driver.busy, t.driver.offline]);

  const taxiMarkers = useMemo(
    () =>
      (drivers || [])
        .filter((driver) => typeof driver.current_lat === "number" && typeof driver.current_lng === "number")
        .map((driver, index) => ({
          id: index + 1,
          latitude: Number(driver.current_lat),
          longitude: Number(driver.current_lng),
          driverName: driver.user?.phone_number || String(driver.id).slice(0, 8),
          rating: Number(driver.rating || 0),
          status: (driver.status || "offline") as "available" | "busy" | "offline",
        })),
    [drivers]
  );

  const handleTaxiStatusChange = async (taxiId: string, status: TaxiStatus) => {
    await updateTaxiStatusMutation.mutateAsync({ taxiId, status });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b border-border/50 shadow-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Taximun</h1>
            <p className="text-sm text-muted-foreground">{t.admin.adminPanel}</p>
          </div>
          <Button variant="outline" onClick={logout} className="gap-2">
            <LogOut className="w-4 h-4" />
            {t.nav.logout}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-7xl mx-auto px-4 py-8">
        {isLoading && (
          <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t.common.loading}
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Car className="w-4 h-4 text-accent" />
                {t.admin.activeRides}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{stats?.activeRides ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.admin.completedRides}: {recentRides?.filter((ride) => ride.status === "completed").length ?? 0}</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-secondary" />
                {t.admin.drivers}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{drivers?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats?.activeDrivers ?? 0} {t.driver.available}</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                {t.admin.totalRevenue}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(Number(stats?.totalEarnings ?? 0))}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.common.total}</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                {t.admin.averageRating}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{Number(stats?.avgRating ?? 0).toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">/ 5.0</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard">{t.admin.dashboard}</TabsTrigger>
            <TabsTrigger value="map">{t.map.map}</TabsTrigger>
            <TabsTrigger value="users">{t.admin.userManagement}</TabsTrigger>
            <TabsTrigger value="fleet">{t.admin.fleetManagement}</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rides Chart */}
              <Card className="shadow-lg border-border/50">
                <CardHeader>
                  <CardTitle>{t.admin.statistics}</CardTitle>
                  <CardDescription>{t.admin.activeRides} / {t.admin.totalRevenue}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={weeklyRidesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="rides" fill={CHART_COLORS[0]} />
                      <Bar dataKey="revenue" fill={CHART_COLORS[1]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Status Pie Chart */}
              <Card className="shadow-lg border-border/50">
                <CardHeader>
                  <CardTitle>{t.driver.status}</CardTitle>
                  <CardDescription>{t.admin.allDrivers}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Trend */}
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle>{t.admin.totalRevenue}</CardTitle>
                <CardDescription>{t.admin.recentRides ?? t.admin.completedRides}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={weeklyRidesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS[0]} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Map Tab */}
          <TabsContent value="map" className="mt-6">
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle>{t.admin.allTaxis}</CardTitle>
                <CardDescription>{t.map.availableTaxis}</CardDescription>
              </CardHeader>
              <CardContent className="p-0 rounded-lg overflow-hidden" style={{ height: "600px" }}>
                <TaxiMap readOnly taxis={taxiMarkers} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <Card className="shadow-lg border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t.admin.userManagement}</CardTitle>
                  <CardDescription>{t.admin.allDrivers} / {t.admin.allPassengers}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Search */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder={t.common.search}
                        className="pl-10 border-border/50"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <Button variant="outline" className="gap-2 border-border/50">
                      <Filter className="w-4 h-4" />
                      {t.common.filter}
                    </Button>
                  </div>

                  {/* Table */}
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead>{t.common.status}</TableHead>
                          <TableHead>{t.auth.name}</TableHead>
                          <TableHead>{t.auth.phone}</TableHead>
                          <TableHead>{t.common.status}</TableHead>
                          <TableHead className="text-right">ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length > 0 ? (
                          filteredUsers.map((user) => (
                            <TableRow key={`${user.role}-${user.id}`} className="border-border/50">
                              <TableCell>
                                <Badge variant="outline">{user.role}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">{user.name}</TableCell>
                              <TableCell className="text-muted-foreground">{user.contact}</TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    user.status === "available" || user.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : user.status === "busy"
                                        ? "bg-orange-100 text-orange-800"
                                        : "bg-gray-100 text-gray-800"
                                  }
                                >
                                  {user.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {user.id.slice(0, 8)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              {t.common.noData}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fleet Tab */}
          <TabsContent value="fleet" className="mt-6">
            <Card className="shadow-lg border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t.admin.fleetManagement}</CardTitle>
                  <CardDescription>{t.admin.allTaxis}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>{t.admin.taxiLicense}</TableHead>
                        <TableHead>{t.auth.name}</TableHead>
                        <TableHead>{t.driver.status}</TableHead>
                        <TableHead>{t.common.date}</TableHead>
                        <TableHead className="text-right">ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taxis && taxis.length > 0 ? (
                        taxis.map((taxi) => (
                          <TableRow key={taxi.id} className="border-border/50">
                            <TableCell className="font-mono">{taxi.license_plate || "--"}</TableCell>
                            <TableCell>{taxi.vehicle_model || taxi.driver?.id?.slice?.(0, 8) || "--"}</TableCell>
                            <TableCell>
                              <Select
                                value={(taxi.status || "available") as TaxiStatus}
                                onValueChange={(value) => handleTaxiStatusChange(String(taxi.id), value as TaxiStatus)}
                                disabled={updateTaxiStatusMutation.isPending}
                              >
                                <SelectTrigger className="w-[160px] border-border/50">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="available">available</SelectItem>
                                  <SelectItem value="maintenance">maintenance</SelectItem>
                                  <SelectItem value="retired">retired</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(taxi.created_at)}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {String(taxi.id).slice(0, 8)}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            {t.common.noData}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
