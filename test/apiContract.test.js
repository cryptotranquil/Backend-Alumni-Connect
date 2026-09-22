const test = require("node:test");
const assert = require("node:assert/strict");

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:9999";
process.env.FIREBASE_PROJECT_ID ||= "alumni-connect-test";
process.env.JWT_SECRET ||= "test-jwt-secret";
process.env.NODE_ENV = "test";

function endpoints(router) {
  return new Set(
    router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map(
          (method) => `${method.toUpperCase()} ${layer.route.path}`,
        ),
      ),
  );
}

function assertRoutes(file, expected) {
  const found = endpoints(require(file));
  for (const endpoint of expected) {
    assert.ok(found.has(endpoint), `${file} is missing ${endpoint}`);
  }
}

test("routes cover every real HTTP call made by the frontend API modules", () => {
  assertRoutes("../src/routes/authRoutes", [
    "GET /bootstrap",
    "POST /register",
    "POST /login",
    "POST /login/verify-2fa",
    "POST /login/resend-2fa",
    "POST /forgot-password",
    "POST /reset-password",
  ]);
  assertRoutes("../src/routes/userRoutes", [
    "GET /profile",
    "PUT /profile/update",
    "PUT /profile/password",
    "POST /profile/photo",
    "POST /profile/media",
    "GET /users/:id",
    "GET /users/:id/experiences",
    "GET /users/:id/achievements",
    "GET /users/:id/tagged-posts",
    "GET /users/:id/activity",
    "GET /users/:id/suggestions",
    "GET /users/:id/connections",
    "GET /users/:id/followers",
    "GET /users/:id/follow-status",
    "POST /users/:id/follow",
    "GET /users/:id/recommendations",
    "POST /users/:id/recommendations",
    "GET /users/:id/skill-endorsements",
    "POST /users/:id/endorse",
  ]);
  assertRoutes("../src/routes/eventRoutes", [
    "GET /",
    "POST /",
    "GET /mine",
    "POST /:id/join",
    "POST /:id/rsvp",
    "GET /:id/rsvp-status",
    "GET /:id/participants",
  ]);
  assertRoutes("../src/routes/jobRoutes", [
    "GET /",
    "POST /",
    "PUT /:id",
    "DELETE /:id",
    "POST /:id/apply",
    "POST /:id/refer",
    "GET /:id/refer-status",
  ]);
  assertRoutes("../src/routes/connectionRoutes", [
    "POST /request",
    "GET /student",
    "GET /alumni",
    "GET /status/:targetId",
  ]);
  assertRoutes("../src/routes/groupRoutes", [
    "GET /",
    "GET /:id/membership",
    "POST /:id/toggle",
    "GET /:id/posts",
    "GET /:id/members",
  ]);
  assertRoutes("../src/routes/mentorRoutes", [
    "GET /matches",
    "GET /mentees",
    "GET /state",
    "POST /request",
    "POST /offer",
  ]);
  assertRoutes("../src/routes/postRoutes", [
    "GET /",
    "POST /",
    "POST /:id/like",
    "POST /:id/comments",
    "PUT /:id",
    "DELETE /:id",
  ]);
});
