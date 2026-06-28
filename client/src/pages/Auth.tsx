import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Car, Users, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getLoginUrl } from "@/const";

export default function Auth() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [selectedRole, setSelectedRole] = useState<"passenger" | "driver" | "admin">("passenger");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("es");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = "/";
    }
  }, [isAuthenticated]);

  const handleLogin = () => {
    setError("");
    if (!email || !password) {
      setError(t.errors.requiredField);
      return;
    }
    // Redirect to Manus OAuth login
    window.location.href = getLoginUrl();
  };

  const handleSignup = () => {
    setError("");
    if (!name || !email || !password || !confirmPassword) {
      setError(t.errors.requiredField);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.errors.passwordMismatch);
      return;
    }
    // In a real app, this would call an API to create the user with the selected role
    // For now, redirect to OAuth login
    window.location.href = getLoginUrl();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Car className="w-10 h-10 text-accent" />
          <h1 className="text-4xl font-bold text-foreground">Taximun</h1>
        </div>
        <p className="text-muted-foreground text-lg">{t.common.loading}</p>
      </div>

      {/* Main Card */}
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-center">{t.auth.login}</CardTitle>
          <CardDescription className="text-center">{t.auth.noAccount}</CardDescription>
        </CardHeader>

        <CardContent>
          {/* Role Selection */}
          <div className="mb-6 space-y-3">
            <Label className="text-sm font-semibold">{t.common.status}</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSelectedRole("passenger")}
                className={`p-3 rounded-lg border-2 transition-all ${
                  selectedRole === "passenger"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/50"
                }`}
              >
                <Users className="w-5 h-5 mx-auto mb-1" />
                <span className="text-xs font-medium">{t.auth.loginAsPassenger}</span>
              </button>

              <button
                onClick={() => setSelectedRole("driver")}
                className={`p-3 rounded-lg border-2 transition-all ${
                  selectedRole === "driver"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/50"
                }`}
              >
                <Car className="w-5 h-5 mx-auto mb-1" />
                <span className="text-xs font-medium">{t.auth.loginAsDriver}</span>
              </button>

              <button
                onClick={() => setSelectedRole("admin")}
                className={`p-3 rounded-lg border-2 transition-all ${
                  selectedRole === "admin"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/50"
                }`}
              >
                <Shield className="w-5 h-5 mx-auto mb-1" />
                <span className="text-xs font-medium">{t.auth.loginAsAdmin}</span>
              </button>
            </div>
          </div>

          {/* Tabs for Login/Signup */}
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">{t.auth.login}</TabsTrigger>
              <TabsTrigger value="signup">{t.auth.signup}</TabsTrigger>
            </TabsList>

            {/* Login Tab */}
            <TabsContent value="login" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t.auth.email}</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">{t.auth.password}</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-border/50"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleLogin} className="w-full bg-accent hover:bg-accent/90">
                {t.auth.login}
              </Button>
            </TabsContent>

            {/* Signup Tab */}
            <TabsContent value="signup" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">{t.auth.name}</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email">{t.auth.email}</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-phone">{t.auth.phone}</Label>
                <Input
                  id="signup-phone"
                  type="tel"
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-language">{t.auth.language}</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="signup-language" className="border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="ca">Català</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">{t.auth.password}</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-confirm">{t.auth.confirmPassword}</Label>
                <Input
                  id="signup-confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="border-border/50"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleSignup} className="w-full bg-accent hover:bg-accent/90">
                {t.auth.signup}
              </Button>
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">O</span>
            </div>
          </div>

          {/* OAuth Button */}
          <Button
            onClick={() => (window.location.href = getLoginUrl())}
            variant="outline"
            className="w-full border-border/50 hover:bg-muted"
          >
            {t.auth.login} con Manus
          </Button>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        © 2026 Taximun. {t.common.loading}
      </p>
    </div>
  );
}
