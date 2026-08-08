import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/i18n/useI18n";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

const REDIRECT_PATH_KEY = "taximun_redirect_path";

const readPendingRedirectPath = () => {
  try {
    const path = sessionStorage.getItem(REDIRECT_PATH_KEY);
    sessionStorage.removeItem(REDIRECT_PATH_KEY);
    if (
      path === "/auth" ||
      path === "/test" ||
      path === "/passenger" ||
      path === "/driver" ||
      path === "/admin"
    ) {
      return path;
    }
  } catch {
    // Ignore storage errors.
  }
  return null;
};

const moveRecoveryCallbackToAuth = () => {
  const raw = `${window.location.search}${window.location.hash}`;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const isRecovery =
    raw.includes("type=recovery") ||
    search.get("recovery") === "1" ||
    hash.get("type") === "recovery" ||
    (Boolean(search.get("error")) && Boolean(search.get("error_description"))) ||
    (Boolean(hash.get("error")) && Boolean(hash.get("error_description")));

  if (!isRecovery) return false;

  window.location.replace(`/auth${window.location.search}${window.location.hash}`);
  return true;
};

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (moveRecoveryCallbackToAuth()) return;
    if (loading) return;

    const pendingRedirectPath = readPendingRedirectPath();
    if (pendingRedirectPath) {
      setLocation(pendingRedirectPath);
      return;
    }

    if (!isAuthenticated) {
      setLocation("/auth");
      return;
    }

    // Redirect based on role
    if (user?.role === "passenger") {
      setLocation("/passenger");
    } else if (user?.role === "driver") {
      setLocation("/driver");
    } else if (user?.role === "admin") {
      setLocation("/admin");
    }
  }, [isAuthenticated, loading, user, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/5">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto" />
        <p className="text-lg text-muted-foreground">{t.common.loading}</p>
      </div>
    </div>
  );
}
