export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const hasOAuthConfig = () => {
  return Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID);
};

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId || typeof window === "undefined") {
    return "/auth";
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL("/app-auth", oauthPortalUrl);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch (error) {
    console.warn("Invalid OAuth portal URL. Check VITE_OAUTH_PORTAL_URL.", error);
    return "/auth";
  }
};
