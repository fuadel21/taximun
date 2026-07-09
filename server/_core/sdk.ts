import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getUserFromToken } from "../supabase-client";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";

// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const configuredAdminEmails = () =>
  ENV.adminEmails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const isConfiguredAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;
  return configuredAdminEmails().includes(email.trim().toLowerCase());
};

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }

  private decodeState(state: string): string {
    const redirectUri = atob(state);
    return redirectUri;
  }

  async getTokenByCode(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_MICROSOFT_ENTRA")
    ) {
      return "microsoft";
    }
    return null;
  }

  getOAuthService() {
    return this.oauthService;
  }

  async createSession(payload: SessionPayload): Promise<string> {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1y")
      .sign(secret);
  }

  async verifySession(token: string | null | undefined): Promise<SessionPayload | null> {
    if (!isNonEmptyString(token)) return null;
    try {
      const secret = new TextEncoder().encode(ENV.cookieSecret);
      const { payload } = await jwtVerify(token, secret);
      if (
        typeof payload.openId === "string" &&
        typeof payload.appId === "string" &&
        typeof payload.name === "string"
      ) {
        return payload as SessionPayload;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  getBearerToken(req: Request): string | null {
    const authorization = req.headers.authorization;
    if (!authorization || Array.isArray(authorization)) return null;
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
  }

  parseCookies(cookieHeader: string | undefined): Map<string, string> {
    const parsed = parseCookieHeader(cookieHeader ?? "");
    return new Map(Object.entries(parsed));
  }

  async setSessionCookie(res: any, token: string): Promise<void> {
    const isProduction = process.env.NODE_ENV === "production";
    const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
      ONE_YEAR_MS / 1000
    )}${isProduction ? "; Secure" : ""}`;
    res.setHeader("Set-Cookie", cookie);
  }

  async clearSessionCookie(res: any): Promise<void> {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
  }

  async exchangeToken(code: string, state: string) {
    const token = await this.oauthService.getTokenByCode(code, state);
    const userInfo = await this.oauthService.getUserInfoByToken(token);
    const loginMethod = this.deriveLoginMethod(
      (userInfo as any)?.platforms,
      (userInfo as any)?.platform ?? userInfo.platform ?? null
    );

    await db.upsertUser({
      openId: userInfo.openId,
      name: userInfo.name || null,
      email: userInfo.email ?? null,
      loginMethod,
      role: isConfiguredAdminEmail(userInfo.email) ? "admin" : undefined,
      lastSignedIn: new Date(),
    });

    return {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod,
      platform: loginMethod,
    };
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  private async authenticateSupabaseToken(
    token: string,
    signedInAt: Date
  ): Promise<AuthenticatedUser | null> {
    const supabaseUser = await getUserFromToken(token);

    if (!supabaseUser) {
      return null;
    }

    const metadata = supabaseUser.user_metadata ?? {};
    const metadataRole = typeof metadata.role === "string" ? metadata.role : null;
    const safeRole = isConfiguredAdminEmail(supabaseUser.email)
      ? "admin"
      : metadataRole === "passenger" || metadataRole === "driver"
        ? metadataRole
        : "passenger";
    const name =
      typeof metadata.name === "string"
        ? metadata.name
        : typeof metadata.full_name === "string"
          ? metadata.full_name
          : supabaseUser.email?.split("@")[0] || "Taximun user";
    const openId = `supabase:${supabaseUser.id}`;

    await db.upsertUser({
      openId,
      name,
      email: supabaseUser.email ?? null,
      loginMethod: "supabase",
      role: safeRole,
      lastSignedIn: signedInAt,
    });

    const user = await db.getUserByOpenId(openId);
    if (user) {
      return user;
    }

    // Production Supabase-only deployments do not need the legacy MySQL user
    // table for taxiOps. Return a safe runtime user when DATABASE_URL is absent.
    const now = new Date();
    return {
      id: -1,
      openId,
      name,
      email: supabaseUser.email ?? null,
      phone: null,
      loginMethod: "supabase",
      role: safeRole,
      language: "es",
      profilePicture: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: signedInAt,
    } as unknown as AuthenticatedUser;
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const signedInAt = new Date();

    // 1. Prefer the session cookie for the legacy OAuth flow.
    const cookies = this.parseCookies(req.headers.cookie);
    const cookieSessionToken = cookies.get(COOKIE_NAME);

    // 2. Also support Authorization Bearer. This may be either the legacy
    //    internal JWT or a Supabase Auth access token.
    const bearerToken = this.getBearerToken(req);
    const sessionToken = cookieSessionToken ?? bearerToken;

    const session = await this.verifySession(sessionToken);

    if (!session && bearerToken) {
      const supabaseUser = await this.authenticateSupabaseToken(
        bearerToken,
        signedInAt
      );
      if (supabaseUser) {
        return supabaseUser;
      }
    }

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }

    const sessionUserId = session.openId;
    let user = await db.getUserByOpenId(sessionUserId);

    // If user not in DB, sync from OAuth server automatically.
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          role: isConfiguredAdminEmail(userInfo.email) ? "admin" : undefined,
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      role: isConfiguredAdminEmail(user.email) ? "admin" : user.role,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

const CRON_OPEN_ID_PREFIX = "cron_";

/** Result of `sdk.authenticateRequest`. Cron callbacks set `isCron=true` and `taskUid`; see `references/periodic-updates.md`. */
export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

function buildCronUser(
  userInfo: GetUserInfoWithJwtResponse
): AuthenticatedUser {
  const now = new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "passenger",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? undefined,
    isCron: true,
  } as unknown as AuthenticatedUser;
}

export const sdk = new SDKServer();
