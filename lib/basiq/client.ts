import type {
  BasiqAccount,
  BasiqAuthLink,
  BasiqConnection,
  BasiqInstitution,
  BasiqList,
  BasiqTokenResponse,
  BasiqTransaction,
  BasiqUser,
} from "./types";

const DEFAULT_API_URL = "https://au-api.basiq.io";
const API_VERSION = "3.0";

interface CachedToken {
  token: string;
  expiresAt: number; // ms epoch
}

// Module-level token cache. Server tokens are valid 60 minutes; we refresh at
// 55 minutes to stay safely inside the window. Process-local cache is fine for
// Vercel: each cold start refreshes once.
let tokenCache: CachedToken | null = null;

function apiUrl(): string {
  return process.env.BASIQ_API_URL ?? DEFAULT_API_URL;
}

function apiKey(): string {
  const key = process.env.BASIQ_API_KEY;
  if (!key) throw new Error("BASIQ_API_KEY is not set");
  return key;
}

async function fetchServerToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.token;
  }

  const res = await fetch(`${apiUrl()}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "basiq-version": API_VERSION,
      Accept: "application/json",
    },
    body: "scope=SERVER_ACCESS",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Basiq token request failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as BasiqTokenResponse;
  tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in - 300) * 1000, // expire 5min early
  };
  return json.access_token;
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Status codes to treat as success (return undefined) instead of throwing. */
  tolerateStatus?: number[];
}

async function basiqRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await fetchServerToken();
  const url = new URL(`${apiUrl()}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const method = opts.method ?? "GET";
  // Basiq's POST endpoints require Content-Type: application/json even when
  // there's no payload (e.g. /auth_link), so we always set it on writes and
  // send an empty `{}` body if the caller didn't provide one.
  const sendsBody = method === "POST";
  const bodyValue = opts.body !== undefined ? opts.body : sendsBody ? {} : null;
  const bodyString = bodyValue !== null ? JSON.stringify(bodyValue) : undefined;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "basiq-version": API_VERSION,
    Accept: "application/json",
  };
  if (bodyString !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { method, headers, body: bodyString, cache: "no-store" });

  if (!res.ok) {
    if (opts.tolerateStatus?.includes(res.status)) {
      return undefined as unknown as T;
    }
    const body = await res.text();
    throw new Error(`Basiq ${opts.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
  }

  // Some endpoints (e.g. DELETE) return no body.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as unknown as T;
  }
  return (await res.json()) as T;
}

// --- Public API surface -----------------------------------------------------

export const basiq = {
  /** Create a Basiq user, returning their id. Email is required by Basiq. */
  async createUser(email: string, mobile?: string): Promise<BasiqUser> {
    return basiqRequest<BasiqUser>("/users", {
      method: "POST",
      body: { email, ...(mobile ? { mobile } : {}) },
    });
  },

  async getUser(basiqUserId: string): Promise<BasiqUser> {
    return basiqRequest<BasiqUser>(`/users/${basiqUserId}`);
  },

  /**
   * Create an auth link for the consent flow. The returned `links.public` URL
   * is the Basiq Consent UI for the user to authenticate with their bank.
   *
   * `successUrl` and `errorUrl` are appended as query params on the consent URL
   * — Basiq honours them as per-session overrides of any app-level redirect
   * config, which means we don't need to configure redirect URLs in the Basiq
   * dashboard at all.
   */
  async createAuthLink(
    basiqUserId: string,
    options: { successUrl?: string; errorUrl?: string; mobile?: string } = {},
  ): Promise<BasiqAuthLink> {
    const link = await basiqRequest<BasiqAuthLink>(`/users/${basiqUserId}/auth_link`, {
      method: "POST",
      body: options.mobile ? { mobile: options.mobile } : {},
    });

    if (options.successUrl || options.errorUrl) {
      const url = new URL(link.links.public);
      if (options.successUrl) url.searchParams.set("success", options.successUrl);
      if (options.errorUrl) url.searchParams.set("error", options.errorUrl);
      link.links.public = url.toString();
    }

    return link;
  },

  async listConnections(basiqUserId: string): Promise<BasiqConnection[]> {
    const list = await basiqRequest<BasiqList<BasiqConnection>>(
      `/users/${basiqUserId}/connections`,
    );
    return list.data ?? [];
  },

  /**
   * Permanently disconnect a bank connection. Basiq stops syncing future
   * transactions; existing transactions stay in our DB until the user wipes
   * them explicitly. Idempotent — Basiq returns 204 even on a missing
   * connection id, which the request helper tolerates.
   */
  async deleteConnection(basiqUserId: string, basiqConnectionId: string): Promise<void> {
    // Tolerate 404 / already-gone: an invalid/expired connection on Basiq's
    // side is the exact case the user is trying to clean up, so a missing
    // upstream record is success, not failure.
    await basiqRequest<void>(`/users/${basiqUserId}/connections/${basiqConnectionId}`, {
      method: "DELETE",
      tolerateStatus: [404, 410],
    });
  },

  /**
   * List the accounts Basiq has on file for a user — current + available
   * balance per account, plus class/type so we can decide which accounts
   * count toward "spendable balance" for the cashflow forecast.
   */
  async listAccounts(basiqUserId: string): Promise<BasiqAccount[]> {
    const list = await basiqRequest<BasiqList<BasiqAccount>>(
      `/users/${basiqUserId}/accounts`,
    );
    return list.data ?? [];
  },

  async getInstitution(institutionId: string): Promise<BasiqInstitution> {
    return basiqRequest<BasiqInstitution>(`/institutions/${institutionId}`);
  },

  /** List transactions for a Basiq user. Filter strings use Basiq's SCIM-like syntax. */
  async listTransactions(
    basiqUserId: string,
    options: { filter?: string; limit?: number } = {},
  ): Promise<BasiqTransaction[]> {
    const all: BasiqTransaction[] = [];
    let path: string | null = `/users/${basiqUserId}/transactions`;
    let query: Record<string, string | number | undefined> = {
      ...(options.filter ? { filter: options.filter } : {}),
      ...(options.limit ? { limit: options.limit } : { limit: 500 }),
    };

    // Follow `links.next` if Basiq paginates.
    while (path) {
      const page: BasiqList<BasiqTransaction> = await basiqRequest(path, { query });
      all.push(...(page.data ?? []));
      const next = page.links?.next;
      if (next && (!options.limit || all.length < options.limit)) {
        // next is a full URL; strip the host so basiqRequest's URL builder works.
        const u = new URL(next);
        path = u.pathname;
        query = Object.fromEntries(u.searchParams.entries());
      } else {
        path = null;
      }
    }

    return options.limit ? all.slice(0, options.limit) : all;
  },
};

// Test-only utility — clears the in-memory token cache.
export function __resetBasiqTokenCacheForTests() {
  tokenCache = null;
}
