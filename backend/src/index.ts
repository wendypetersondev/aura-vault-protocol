import express from "express";
import cors from "cors";
import { pingRedis } from "./redis.js";
import {
  generateTokens,
  validateAccessToken,
  refreshAccessToken,
  logout,
  getUserSessions,
  revokeAllSessions,
  type Tier,
} from "./auth.js";
import { cacheMiddleware } from "./middleware/cacheMiddleware.js";
import {
  globalIpRateLimiter,
  authRateLimiter,
  userRateLimiter,
} from "./middleware/rateLimitMiddleware.js";
import { getAssetPrice, getPools, warmCache } from "./services/defi.js";
import { getCacheStats } from "./cache.js";

const app = express();
app.use(cors());
app.use(express.json());

// Global IP rate limiter — health check excluded so load-balancer probes are not throttled
app.use(globalIpRateLimiter(["/api/health"]));

async function authenticate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const payload = await validateAccessToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as any).user = payload;
  next();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

app.post("/api/auth/login", authRateLimiter(), async (req, res) => {
  const { walletAddress, deviceId, tier } = req.body;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress required" });
    return;
  }
  const validTier: Tier = tier === "paid" ? "paid" : "free";
  const tokens = await generateTokens(walletAddress, deviceId, validTier);
  res.json(tokens);
});

app.post("/api/auth/refresh", authRateLimiter(), async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  const tokens = await refreshAccessToken(refreshToken);
  if (!tokens) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  res.json(tokens);
});

app.post("/api/auth/logout", authenticate, userRateLimiter(), async (req, res) => {
  const token = req.headers.authorization!.slice(7);
  const { refreshToken } = req.body;
  await logout(token, refreshToken);
  res.json({ success: true });
});

app.get("/api/auth/sessions", authenticate, userRateLimiter(), async (req, res) => {
  const sessions = await getUserSessions((req as any).user.sub);
  res.json({ sessions });
});

app.post("/api/auth/revoke-all", authenticate, userRateLimiter(), async (req, res) => {
  await revokeAllSessions((req as any).user.sub);
  res.json({ success: true });
});

// ── DeFi ─────────────────────────────────────────────────────────────────────

const PRICE_TTL = parseInt(process.env.CACHE_DEFI_PRICE_TTL || "30", 10);
const POOL_TTL = parseInt(process.env.CACHE_DEFI_POOL_TTL || "60", 10);

app.get("/api/defi/price/:asset", cacheMiddleware(PRICE_TTL), async (req, res) => {
  try {
    const price = await getAssetPrice(req.params.asset as string);
    res.json(price);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.get("/api/defi/pools", cacheMiddleware(POOL_TTL), async (req, res) => {
  try {
    const pools = await getPools();
    res.json({ pools });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cache metrics ─────────────────────────────────────────────────────────────

app.get("/api/cache/stats", async (_req, res) => {
  const stats = await getCacheStats();
  res.json({ stats });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", async (_req, res) => {
  const redisOk = await pingRedis();
  res.json({
    status: "ok",
    redis: redisOk ? "ok" : "error",
    timestamp: new Date().toISOString(),
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Aura Vault backend running on port ${PORT}`);
  await warmCache();
});

export default app;
