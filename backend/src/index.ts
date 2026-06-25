import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import {
  generateTokens,
  validateAccessToken,
  refreshAccessToken,
  logout,
  getUserSessions,
  revokeAllSessions,
} from "./auth.js";
import {
  enqueue,
  getJob,
  listJobs,
  getDeadLetterJobs,
  queueMetrics,
  startWorker,
  type TxJobData,
} from "./queue.js";

const app = express();
app.use(cors());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many auth requests, try again later" },
});

// Auth middleware
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const payload = validateAccessToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as any).user = payload;
  next();
}

// POST /api/auth/login — wallet-based login
app.post("/api/auth/login", authLimiter, (req, res) => {
  const { walletAddress, deviceId } = req.body;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress required" });
    return;
  }
  const tokens = generateTokens(walletAddress, deviceId);
  res.json(tokens);
});

// POST /api/auth/refresh
app.post("/api/auth/refresh", authLimiter, (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  const tokens = refreshAccessToken(refreshToken);
  if (!tokens) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  res.json(tokens);
});

// POST /api/auth/logout
app.post("/api/auth/logout", authenticate, (req, res) => {
  const token = req.headers.authorization!.slice(7);
  const { refreshToken } = req.body;
  logout(token, refreshToken);
  res.json({ success: true });
});

// GET /api/auth/sessions
app.get("/api/auth/sessions", authenticate, (req, res) => {
  const user = (req as any).user;
  res.json({ sessions: getUserSessions(user.sub) });
});

// POST /api/auth/revoke-all
app.post("/api/auth/revoke-all", authenticate, (req, res) => {
  const user = (req as any).user;
  revokeAllSessions(user.sub);
  res.json({ success: true });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Transaction Queue — Issue #79
// ---------------------------------------------------------------------------

const txLimiter = rateLimit({ windowMs: 60_000, max: 200, message: { error: "Rate limit exceeded" } });

// POST /api/tx — enqueue a new transaction job
app.post("/api/tx", authenticate, txLimiter, (req, res) => {
  const { type, walletAddress, amount, webhookUrl, meta } = req.body as Partial<TxJobData>;
  if (!type || !["deposit", "withdrawal", "claim"].includes(type)) {
    res.status(400).json({ error: "type must be deposit | withdrawal | claim" });
    return;
  }
  if (!walletAddress || !amount) {
    res.status(400).json({ error: "walletAddress and amount are required" });
    return;
  }
  const job = enqueue({ type, walletAddress, amount, webhookUrl, meta });
  res.status(202).json({ jobId: job.id, status: job.status });
});

// GET /api/tx/:id — get job status
app.get("/api/tx/:id", authenticate, (req, res) => {
  const job = getJob(req.params["id"]!);
  if (!job) { res.status(404).json({ error: "job not found" }); return; }
  res.json(job);
});

// GET /api/tx — list jobs (optional ?status= filter)
app.get("/api/tx", authenticate, (req, res) => {
  const { status } = req.query;
  res.json({ jobs: listJobs(status as string | undefined) });
});

// GET /api/tx/dlq — dead-letter queue contents
app.get("/api/queue/dlq", authenticate, (req, res) => {
  res.json({ jobs: getDeadLetterJobs() });
});

// GET /api/queue/metrics — monitoring dashboard data
app.get("/api/queue/metrics", authenticate, (req, res) => {
  res.json(queueMetrics());
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  startWorker();
  console.log(`Aura Vault backend running on port ${PORT}`);
});

export default app;
