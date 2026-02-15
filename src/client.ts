const BASE_URL =
  process.env.DEEL_API_BASE_URL || "https://api.letsdeel.com/rest/v2";
const API_TOKEN = process.env.DEEL_API_TOKEN;

if (!API_TOKEN) {
  console.error(
    "ERROR: DEEL_API_TOKEN environment variable is required. " +
      "Generate one at Deel → More → Developer → Access Tokens."
  );
  process.exit(1);
}

// In-memory TTL cache — avoids redundant API calls within a session.
// Data rarely changes, so a 5-minute default is safe.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function cacheGet(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function cacheSet(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Simple sliding-window rate limiter (5 req/sec)
class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests = 5;
  private windowMs = 1000;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.windowMs
    );
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0]!;
      const waitTime = this.windowMs - (now - oldest) + 10;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.timestamps.push(Date.now());
  }
}

const rateLimiter = new RateLimiter();

export interface DeelPaginatedResponse<T> {
  data: T;
  page?: {
    cursor?: string;
    total_rows?: number;
    total?: number;
    offset?: number;
    limit?: number;
  };
}

// Raw JSON response — used when the shape doesn't follow the standard pattern
export async function deelRequestRaw(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<unknown> {
  const res = await deelRequest<unknown>(path, params);
  return res;
}

export async function deelRequest<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<DeelPaginatedResponse<T>> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // Check cache before making network request
  const cacheKey = url.toString();
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    return cached as DeelPaginatedResponse<T>;
  }

  await rateLimiter.waitForSlot();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          Accept: "application/json",
        },
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * (attempt + 1);
        console.error(`Rate limited, retrying in ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (response.status >= 500) {
        const waitMs = 1000 * (attempt + 1);
        console.error(`Server error ${response.status}, retrying in ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        let message = `Deel API error ${response.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed.message) message += `: ${parsed.message}`;
          if (parsed.errors) message += ` - ${JSON.stringify(parsed.errors)}`;
        } catch {
          if (body) message += `: ${body.slice(0, 200)}`;
        }
        if (response.status === 403) {
          message += ". Check that your API token has the required read scope for this resource.";
        }
        throw new Error(message);
      }

      const result = (await response.json()) as DeelPaginatedResponse<T>;
      cacheSet(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Deel API error")) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 2) {
        const waitMs = 1000 * (attempt + 1);
        console.error(`Request failed, retrying in ${waitMs}ms: ${lastError.message}`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  throw lastError || new Error("Request failed after 3 attempts");
}
