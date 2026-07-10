import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { TaxiNotificationCenter } from "@/components/TaxiNotificationCenter";

const hiddenPaths = ["/", "/auth", "/test"];

export function GlobalNotificationDock() {
  const [location] = useLocation();
  const [hasSession, setHasSession] = useState(false);
  const shouldHide = useMemo(() => hiddenPaths.includes(location), [location]);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setHasSession(Boolean(data.session));
    };

    checkSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (shouldHide || !hasSession) return null;

  return (
    <div className="fixed right-4 top-4 z-[9999]">
      <TaxiNotificationCenter compact />
    </div>
  );
}
