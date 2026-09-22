# Alumni Connect Backend

Express 5 + Firestore API aligned with the React/TypeScript frontend in
`Xoski2/alumni-connect-frontend`.

## Implemented frontend modules

- JWT authentication, registration, password reset and first-admin bootstrap
- Immediate student **and alumni** activation, matching the registration UI
- Rich profiles: headline, cover photo, experience, achievements, skills and bio
- Followers, recommendations and skill endorsements
- Student/alumni directories and connection status
- Mentorship matching, requests, alumni offers and active mentorships
- Community posts, likes, comments, edits, deletes and tagged posts
- Groups, membership toggling, members and group discussions
- Jobs, moderation, applications, referrals and job statistics
- Events, RSVP toggling, attendee lists and upcoming events
- Real-time messaging with Socket.IO
- In-app notifications and optional Brevo email delivery
- Admin users, departments, jobs, events and dashboard analytics
- CV, profile photo and cover photo storage through Cloudinary

## Requirements

- Node.js 18 or newer
- A Firebase/Google Cloud Firestore project (or the Firestore emulator)
- Optional: Cloudinary for uploads and Brevo for email

## Setup

```bash
npm install
cp .env.example .env
# Fill in JWT_SECRET and Firestore credentials
npm run seed
npm run dev
```

The API listens on `http://localhost:5000`; all REST endpoints are under
`/api`, and Socket.IO is served from the same origin.

### Firestore credentials

Choose one:

1. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to raw JSON or base64-encoded JSON.
2. Set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account file.
3. For local development, set `FIRESTORE_EMULATOR_HOST` and
   `FIREBASE_PROJECT_ID`.

Credential files and `.env` are ignored by Git.

## Frontend configuration

Set the frontend's environment variable:

```env
VITE_API_BASE_URL=http://localhost:5000
```

The frontend talks to this API by default. To work on the UI with demo data and
no backend, set `VITE_MOCK_MODE=true` in the frontend `.env` (2FA and the real
session are skipped in that mode). Three frontend adapters (`postApi.ts`,
`groupsApi.ts` membership lookup, and `mentorshipApi.ts` state lookup) are still
hard-coded to local state; the corresponding real backend endpoints are
available as documented below.

## Main endpoint map

| Module | Endpoints |
|---|---|
| Auth | `GET /api/bootstrap`, `POST /api/register`, `POST /api/login`, `POST /api/login/verify-2fa`, `POST /api/login/resend-2fa`, `POST /api/forgot-password`, `POST /api/reset-password` |
| Profile | `GET /api/profile`, `PUT /api/profile/update`, `POST /api/profile/media`, `GET /api/users/:id` |
| Profile sections | `/api/profile/{experiences,achievements,activity,suggestions,connections,followers,recommendations,skill-endorsements}` and equivalent `/api/users/:id/...` routes |
| Follow | `GET /api/users/:id/follow-status`, `POST /api/users/:id/follow`, `GET /api/profile/following-ids` |
| Connections | `POST /api/connections/request`, `GET /api/connections/status/:targetId`, student/alumni request lists and response routes |
| Mentorship cards | `GET /api/mentors/matches`, `GET /api/mentors/mentees`, `GET /api/mentors/state`, request/offer routes |
| Feed | `GET/POST /api/posts`, `POST /api/posts/:id/like`, `POST /api/posts/:id/comments`, `PUT/DELETE /api/posts/:id` |
| Groups | `GET /api/groups`, `GET /api/groups/:id/membership`, toggle/posts/members routes |
| Jobs | `GET/POST /api/jobs`, update/delete/apply/refer routes, admin approval |
| Events | `GET/POST /api/events`, `GET /api/events/mine`, RSVP/status/participants routes |
| Messages | `GET /api/messages/conversations`, `GET /api/messages/:userId`, `POST /api/messages` |
| Notifications | `GET /api/notifications`, unread count, read and delete routes |
| Admin | `/api/admin/users`, dashboard analytics, departments, job and event moderation |

Authenticated requests use:

```http
Authorization: Bearer <jwt>
```

## Sign-in security

**Strong passwords.** Registration, password reset, password change, admin
invitations and the seeded admin all require 8–72 characters including a
lowercase letter, an uppercase letter, a number and a symbol
(`src/utils/passwordPolicy.js`). Sign-in itself does not enforce the policy, so
accounts created earlier with weaker passwords can still log in; the policy
applies the next time such a password is changed or reset.

**Two-factor authentication (email code).**

1. `POST /api/login` with a correct email and password returns
   `{ twoFactorRequired: true, twoFactorToken, destination }` and emails a
   6-digit code (valid 5 minutes). No session token is issued yet.
2. `POST /api/login/verify-2fa` with `{ twoFactorToken, code }` returns the
   normal `{ user, token, expiresAt, mustChangePassword }`.
3. `POST /api/login/resend-2fa` with `{ twoFactorToken }` sends a new code
   (30-second cooldown) and returns a fresh `twoFactorToken`.

Codes are stored only as a keyed hash, allow 5 wrong attempts, and the
`twoFactorToken` cannot be used as a session token. In `development`/`test`
without Brevo configured the code is printed to the server console and returned
as `devCode`; in production a failed email send blocks sign-in (503) rather
than silently skipping the second factor. Set `TWO_FACTOR_ENABLED=false` to turn
the step off for local work.

**10-minute session.** The session token lasts `SESSION_MINUTES` (default 10)
from the moment it is issued and is not extended by activity. Responses that
issue a token include `expiresAt`. After that time the API answers `401 Token
expired`, and any open Socket.IO connection is closed.

## Alumni registration and the roster

Alumni are approved automatically when their registration number (like `BIT/24/BT/ME/009`) is on the
alumni list an admin uploads (`/api/admin/alumni-roster`).

1. An alumnus must give a registration number when registering (`400` if it is missing or in the
   wrong format). Any spelling is accepted: `bit-24-bt-me-9` is treated as `BIT/24/BT/ME/009`.
2. The number is looked up in `alumniRoster` and claimed in a transaction:
   - **On the roster and unclaimed** -> `201`, account is **active**, a `token` is issued,
     `approvalSource: "roster"`.
   - **Anything else** -> `201`, account is **pending**, `pendingApproval: true`, `token: null`.
     They can sign in, but alumni-only routes answer `403` "pending admin approval" until they are
     approved: automatically when a later roster upload (or `POST /admin/alumni-roster/recheck-pending`)
     contains their number, or by an admin with `PUT /api/admin/approve-alumni/:id`
     (`approvalSource: "manual"`).
   - **Number already registered** (any spelling) -> `409`.
3. If creating the account fails, the roster entry is released. Deleting an alumnus account also
   releases it. Alumni cannot change their registration number once it is set.

Version 1 checks the number only (not the surname), so anyone who knows an alumnus's number could
register with it first. An admin can delete such an account, which frees the entry.

`docs/alumni-roster-schema.md` describes the collections. The Bruno collection has folders
`15 Alumni Roster` (admin endpoints) and `16 Alumni Registration` (this flow).

## Seeding

`npm run seed` ensures the five frontend-supported departments and eight
community groups exist. If `INITIAL_ADMIN_*` variables are supplied, it also
creates the initial administrator if the email does not already exist.

## Verification

```bash
npm run check             # syntax-check all JavaScript
npm test                  # unit/API-contract tests
npm run test:integration  # full API flow against Firestore emulator
```

The integration suite verifies registration, profiles, directories,
mentorship, accepted messaging, posts, follows, recommendations,
endorsements, groups, events, jobs, referrals and profile statistics.

## Production notes

- Set a strong `JWT_SECRET`, `CRON_SECRET`, `FRONTEND_URL` and `CORS_ORIGIN`.
- Configure Cloudinary before enabling uploads.
- Configure Brevo to send reset, message, event and moderation emails, and the
  2FA sign-in code. Without it, database actions still succeed and other email
  is skipped, but **sign-in is blocked** while 2FA is enabled.
- The server binds to `0.0.0.0` and respects `PORT`, so it works on common
  container and PaaS hosts.
