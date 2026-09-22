# Frontend/API Compatibility Notes

This backend was matched against every `api.*` call in the current frontend.

## Response shapes corrected

- `GET /profile` and `PUT /profile/update` return a direct `User` object.
- Job create/update return a direct `Job` object.
- Event creation returns a direct `Event` object.
- Notifications expose `read` (not the Firestore-internal `isRead`) and ISO dates.
- Firestore document IDs are exposed as `_id` throughout frontend-facing data.
- Rich profile, directory, connection, message, job and event fields use the
  names declared in the frontend TypeScript interfaces.

## Backend routes provided for mock-only frontend adapters

The backend supports these routes even though the current frontend adapter does
not call them even with mock mode off:

- Feed: `/api/posts...`
- Group membership: `GET /api/groups/:id/membership`
- Persisted mentorship button state: `GET /api/mentors/state`

To fully switch those screens from local state, update the corresponding
frontend API adapters to call these routes.

## Sign-in flow (2FA + session)

- `POST /api/login` returns either the usual `{ user, token, mustChangePassword, expiresAt }`
  (2FA disabled) or `{ twoFactorRequired: true, twoFactorToken, destination, codeExpiresInSeconds, devCode? }`.
- `POST /api/login/verify-2fa` `{ twoFactorToken, code }` and
  `POST /api/login/resend-2fa` `{ twoFactorToken }` complete/repeat the second step.
- `register`, `login` and `verify-2fa` all include `expiresAt` (ISO string, 10 minutes ahead by default).
- Expired or invalid session tokens get `401` with message `Token expired` / `Invalid token`.
- Password rules are enforced on `register`, `reset-password`, `profile/password`
  and `admin/invite-admin`; violations are `400` with a message listing what is missing.

## Alumni registration (roster)

- `POST /api/register` with `role: "alumni"` now **requires** `registrationNumber` in the format
  `BIT/24/BT/ME/009` (`400` otherwise). The stored number is the normalised form.
- Number on the roster and unclaimed: `201 { user, token, expiresAt, pendingApproval: false }`.
- Otherwise: `201 { user, token: null, pendingApproval: true, message }`. The frontend already
  treats `pendingApproval: true` as "no session yet".
- A pending alumnus can sign in; alumni-only routes return `403 "Your alumni account is pending admin approval."`.
  The frontend should show a "waiting for approval" screen when `user.isApproved === false`.
- Duplicate registration number: `409`.
- `PUT /api/admin/approve-alumni/:id` records `approvalSource: "manual"`, and no longer re-notifies an
  already-active alumnus.
- `PUT /api/profile/update`: an alumnus who already has a registration number gets `400` if they try
  to change it.

