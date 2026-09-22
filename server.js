require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { errorHandler } = require("./src/middleware/errorMiddleware");
const initSocket = require("./src/socket");
const cronService = require("./src/services/cron.service");

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  process.env.JWT_SECRET = "dev-jwt-secret-change-in-production";
  console.warn("JWT_SECRET missing — using an insecure development default.");
}

const app = express();
app.set("trust proxy", 1);

function configuredOrigins() {
  const values = [process.env.CORS_ORIGIN, process.env.FRONTEND_URL]
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set(values);
}

const allowedOrigins = configuredOrigins();
function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  if (allowedOrigins.has(normalized)) return true;
  if (process.env.NODE_ENV !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
  }
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      const error = new Error(`CORS blocked request from ${origin}`);
      error.status = 403;
      return callback(error);
    },
    credentials: true,
  }),
);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan(process.env.NODE_ENV === "test" ? "tiny" : "dev"));
app.use(express.json({ limit: "10mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/register", authLimiter);
app.use("/api/login", authLimiter);
app.use("/api/forgot-password", authLimiter);
app.use("/api/reset-password", authLimiter);

app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    service: "alumni-connect-api",
    timestamp: new Date().toISOString(),
  });
});
app.use("/api", require("./src/routes"));
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});
app.use(errorHandler);

function startServer() {
  const port = Number(process.env.PORT) || 5000;
  const httpServer = http.createServer(app);
  initSocket(httpServer, app, isAllowedOrigin);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Alumni Connect API listening on port ${port}`);
    console.log("Socket.IO ready (same port, path /socket.io/)");
    if (process.env.CRON_SECRET) {
      const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
      cronService.scheduleEventReminders(baseUrl);
    } else {
      console.warn("CRON_SECRET missing — event reminder scheduler is disabled.");
    }
  });

  const shutdown = () => {
    cronService.stopAll();
    httpServer.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return httpServer;
}

if (require.main === module) startServer();
module.exports = app;
module.exports.startServer = startServer;
