export type PendingAuthRole = {
  role: "passenger" | "driver" | "admin";
  language?: "es" | "ca" | "en";
  phoneNumber?: string;
};

const PENDING_AUTH_ROLE_KEY = "taximun_pending_auth_role";

export function savePendingAuthRole(value: PendingAuthRole) {
  localStorage.setItem(PENDING_AUTH_ROLE_KEY, JSON.stringify(value));
}

export function readPendingAuthRole(): PendingAuthRole | null {
  try {
    const raw = localStorage.getItem(PENDING_AUTH_ROLE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingAuthRole>;
    if (parsed.role !== "passenger" && parsed.role !== "driver" && parsed.role !== "admin") {
      return null;
    }

    return {
      role: parsed.role,
      language:
        parsed.language === "es" || parsed.language === "ca" || parsed.language === "en"
          ? parsed.language
          : undefined,
      phoneNumber: parsed.phoneNumber || undefined,
    };
  } catch {
    return null;
  }
}

export function clearPendingAuthRole() {
  localStorage.removeItem(PENDING_AUTH_ROLE_KEY);
}
