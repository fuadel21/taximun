import { useState } from "react";
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
  Download,
  Plus,
} from "lucide-react";

const CHART_COLORS = ["#1e40af", "#7c3aed", "#f59e0b", "#10b981"];

const mockRidesData = [
  { date: "Mon", rides: 45, revenue: 450 },
  { date: "Tue", rides: 52, revenue: 520 },
  { date: "Wed", rides: 48, revenue: 480 },
  { date: "Thu", rides: 61, revenue: 610 },
  { date: "Fri", rides: 75, revenue: 750 },
  { date: "Sat", rides: 89, revenue: 890 },
  { date: "Sun", rides: 72, revenue: 720 },
];

const mockStatusData = [
  { name: "Available", value: 24, color: "#10b981" },
  { name: "Busy", value: 18, color: "#f59e0b" },
  { name: "Offline", value: 8, color: "#6b7280" },
];

const mockUsers = [
  { id: 1, name: "Juan García", role: "driver", email: "juan@example.com", status: "active" },
  { id: 2, name: "María López", role: "passenger", email: "maria@example.com", status: "active" },
  { id: 3, name: "Carlos Ruiz", role: "driver", email: "carlos@example.com", status: "inactive" },
  { id: 4, name: "Ana Martínez", role: "passenger", email: "ana@example.com", status: "active" },
];

export default function AdminPanel() {
  const { t } = useI18nContext();
  const { logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredUsers = mockUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <p className="text-3xl font-bold text-foreground">247</p>
              <p className="text-xs text-muted-foreground mt-1">+12% from yesterday</p>
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
              <p className="text-3xl font-bold text-foreground">50</p>
              <p className="text-xs text-muted-foreground mt-1">24 available now</p>
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
              <p className="text-3xl font-bold text-foreground">€5,240</p>
              <p className="text-xs text-muted-foreground mt-1">Today</p>
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
              <p className="text-3xl font-bold text-foreground">4.8</p>
              <p className="text-xs text-muted-foreground mt-1">Out of 5.0</p>
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
                  <CardDescription>Weekly rides and revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={mockRidesData}>
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
                  <CardDescription>Current taxi status distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={mockStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {mockStatusData.map((entry, index) => (
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
                <CardDescription>Monthly revenue trend</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mockRidesData}>
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
                <TaxiMap readOnly />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <Card className="shadow-lg border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t.admin.userManagement}</CardTitle>
                  <CardDescription>{t.admin.allDrivers} and {t.admin.allPassengers}</CardDescription>
                </div>
                <Button className="gap-2 bg-accent hover:bg-accent/90">
                  <Plus className="w-4 h-4" />
                  {t.common.add}
                </Button>
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
                          <TableHead>{t.auth.email}</TableHead>
                          <TableHead>{t.common.status}</TableHead>
                          <TableHead className="text-right">{t.common.status}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id} className="border-border/50">
                            <TableCell>
                              <Badge variant="outline">{user.role}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell className="text-muted-foreground">{user.email}</TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  user.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-800"
                                }
                              >
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm">
                                {t.common.edit}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
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
                <Button className="gap-2 bg-accent hover:bg-accent/90">
                  <Plus className="w-4 h-4" />
                  {t.common.add}
                </Button>
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
                        <TableHead className="text-right">{t.common.status}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="border-border/50">
                        <TableCell className="font-mono">BCN-1234</TableCell>
                        <TableCell>Juan García</TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">Available</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">2026-06-28</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            {t.common.edit}
                          </Button>
                        </TableCell>
                      </TableRow>
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
