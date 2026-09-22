const { Server } = require("socket.io");
const { verifySessionToken } = require("./utils/generateToken");
const userService = require("./services/userService");

function initSocket(httpServer, app, isAllowedOrigin = () => true) {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("auth_error"));
      const decoded = verifySessionToken(token);
      const user = await userService.findById(decoded.userId);
      if (
        !user ||
        user.accountStatus === "disabled" ||
        (decoded.v || 0) !== (user.tokenVersion || 0)
      ) {
        // Same revocation check as authMiddleware: a logged-out, password-
        // reset, or disabled account's old token should not open a socket
        // even if it hasn't hit its original 10-minute expiry yet.
        return next(new Error("auth_error"));
      }
      socket.userId = String(decoded.userId);
      socket.sessionExpiresAt = decoded.exp * 1000;
      return next();
    } catch (_error) {
      return next(new Error("auth_error"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);

    // The 10-minute session also ends the live connection.
    const timer = setTimeout(
      () => {
        socket.emit("session:expired");
        socket.disconnect(true);
      },
      Math.max(0, socket.sessionExpiresAt - Date.now()),
    );
    if (typeof timer.unref === "function") timer.unref();
    socket.on("disconnect", () => clearTimeout(timer));
  });

  app.set("io", io);
  return io;
}

module.exports = initSocket;
