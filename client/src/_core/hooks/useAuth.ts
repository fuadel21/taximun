import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

const GUEST_ROLE_KEY = "taximun_guest_role";
const REAL_AUTH_KEY = "taximun_real_auth";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

function readGuestRole() {
  try {
    if (localStorage.getItem(REAL_AUTH_KEY) === "1") {
      localStorage.removeItem(GUEST_ROLE_KEY);
      return null;
    }
    const role = localStorage.getItem(GUEST_ROLE_KEY);
    if (role === "passenger" || role === "driver" || role === "admin") {
      return role;
    }
  } catch {}
  return null;
}

function createGuestUser(role: "passenger" | "driver" | "admin") {
  const now = new Date();
  return {
    id: role === "admin" ? -3 : role === "driver" ? -2 : -1,
    openId: `guest:${role}`,
    name: `Invitado ${role}`,
    email: `guest-${role}@taximun.local`,
    phone: null,
    loginMethod: "guest",
    role,
    language: "es",
    profilePicture: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    isGuest: true,
  } as any;
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/auth" } =
    options ?? {};
  const utils = trpc.useUtils();
  const guestRole = typeof window !== "undefined" ? readGuestRole() : null;
  const guestUser = guestRole ? createGuestUser(guestRole) : null;

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !guestUser,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(GUEST_ROLE_KEY);
      localStorage.removeItem(REAL_AUTH_KEY);
    } catch {}

    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const user = guestUser ?? meQuery.data ?? null;
    try {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(user)
      );
    } catch {}
    return {
      user,
      loading: guestUser ? false : meQuery.isLoading || logoutMutation.isPending,
      error: guestUser ? null : meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
      isGuest: Boolean(guestUser),
    };
  }, [
    guestUser,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
