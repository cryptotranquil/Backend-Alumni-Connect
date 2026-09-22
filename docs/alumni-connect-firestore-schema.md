# Alumni Connect — Firestore Schema

Drafted from the actual seed scripts and service code (`scripts/seedCollections.js`, `scripts/seed.js`,
`src/services/*`, `src/controllers/*`) since no prior version of this file was available to merge into.
23 collections total: 20 written by `seedCollections.js`, plus `departments` and `groups` (written by
`npm run seed`), plus `profiles` (legacy, see below).

All collections are written only via the backend (Admin SDK). `firestore.rules` denies direct client access.

---

## `users/{userId}`

The core account record for students, alumni, and admins. `id` is a generated string (see `userService.newUserId()`).

| Field | Type | Notes |
|---|---|---|
| `email` | string | Lower-cased, unique (checked in `authController` register) |
| `password` | string | bcrypt hash |
| `role` | `"student"` \| `"alumni"` \| `"admin"` | |
| `firstname`, `lastname` | string | |
| `accountStatus` | `"active"` \| `"pending"` \| `"disabled"` | Alumni start `"pending"` unless their registration number is on the roster and unclaimed |
| `mustChangePassword` | boolean | |
| `tokenVersion` | number | Incremented to invalidate all outstanding session tokens (password reset, logout-everywhere) |
| `failedLoginAttempts` | number | Resets on success |
| `lockUntil` | timestamp \| null | Account lockout expiry after `MAX_FAILED_LOGIN_ATTEMPTS` |
| `registrationNumber` | string | Students: as given. Alumni: normalized form, e.g. `BIT/24/BT/ME/009` |
| `department`, `program`, `campus` | string | |
| `graduationYear` | string | |
| `university` | string | Defaults to `"Exploits University"` |
| `company`, `position`, `industry`, `yearsOfExperience` | — | Alumni career fields |
| `careerGoals`, `location`, `headline`, `bio` | string | |
| `skills`, `interests` | array\<string\> | |
| `profilePhoto`, `coverPhoto` | string (URL) | |
| `phone` | string | |
| **`approvalSource`** | `"roster"` \| `"manual"` | New (Step 3). How an alumnus became active. Absent for students, admins, and still-pending alumni |
| **`approvedBy`** | string | New. Admin `users` id, set on manual approval |
| **`approvedAt`** | timestamp | New. Set on manual approval |
| `passwordResetTokenHash`, `passwordResetExpires` | string, timestamp | Password-reset flow |
| `createdAt`, `updatedAt` | timestamp | |

## `profiles/{userId}` — legacy

Referenced in `userService.js` (deleted alongside a user, read alongside `findById`) but nothing currently
writes new data to it. `seedCollections.js` explicitly skips seeding it. Kept for backward compatibility;
treat as dead weight rather than an active part of the schema.

## `jobPosts/{jobId}`

| Field | Type | Notes |
|---|---|---|
| `title`, `company`, `location`, `description` | string | |
| `requirements` | array\<string\> | |
| `salary` | string | |
| `deadline` | string (YYYY-MM-DD) | |
| `contactEmail` | string | |
| `type` | `"full-time"` \| `"internship"` \| ... | |
| `postedBy` | string | `users` id (alumni) |
| `status` | `"approved"` \| `"pending"` | Admin-moderated |
| `applicants` | array\<string\> | `users` ids |
| `applicantsCount` | number | |
| `createdAt`, `updatedAt` | timestamp | |

## `jobReferrals/{hash(jobId, referrerId, studentId)}`

| Field | Type |
|---|---|
| `jobId`, `studentId`, `referrerId` | string |
| `note` | string |
| `createdAt` | timestamp |

## `events/{eventId}`

| Field | Type | Notes |
|---|---|---|
| `title`, `description`, `location` | string | |
| `startDate`, `endDate` | timestamp \| null | |
| `eventType` | `"in-person"` \| `"online"` \| ... | |
| `onlineMeetingUrl` | string \| null | |
| `imageUrl` | string | |
| `createdBy` | string | `users` id (admin) |
| `createdAt`, `updatedAt` | timestamp | |

## `eventRegistrations/{hash(eventId, userId)}`

| Field | Type |
|---|---|
| `eventId`, `userId` | string |
| `status` | `"registered"` etc. |
| `registeredAt`, `updatedAt` | timestamp |

## `groupMemberships/{hash(groupId, userId)}`

| Field | Type |
|---|---|
| `groupId`, `userId` | string |
| `createdAt` | timestamp |

## `groups/{groupId}` — seeded by `npm run seed` (`departmentService`/`groupService.ensureSeeded()`)

Fixed catalogue in `src/config/groupSeeds.js` (8 groups: programme, campus, year, and interest groups).

| Field | Type | Notes |
|---|---|---|
| `name`, `emoji`, `description` | string | |
| `category` | `"Programme"` \| `"Campus"` \| `"Year"` \| `"Interest"` | |
| `program` or `campus` | string | Present depending on category |
| `memberCount` | number | Seed value only — not kept in sync by `seedCollections.js` on purpose |
| `createdAt`, `updatedAt` | timestamp | |

## `posts/{postId}`

| Field | Type | Notes |
|---|---|---|
| `authorId` | string | `users` id |
| `category` | string | e.g. `"Career Update"`, `"General"`, `"News"` |
| `text`, `imageUrl` | string | |
| `groupId` | string \| null | |
| `likes` | array\<string\> | `users` ids |
| `comments` | array\<object\> | Each: `_id`, `userId`, `authorName`, `authorPhoto`, `authorRole`, `text`, `createdAt` (denormalized, embedded rather than a subcollection) |
| `createdAt`, `updatedAt` | timestamp | |

## `mentorshipRequests/{requestId}`

| Field | Type |
|---|---|
| `studentId`, `mentorId` | string |
| `skillsRequested`, `interests` | array\<string\> |
| `careerGoals`, `preferredIndustry`, `message` | string |
| `matchScore` | number |
| `matchDetails` | object (`skillOverlap`, `sameDepartment`, ...) |
| `status` | `"pending"` \| `"approved"` \| ... |
| `createdAt`, `updatedAt` | timestamp |

## `mentorshipMatches/{matchId}`

| Field | Type |
|---|---|
| `studentId`, `mentorId` | string |
| `conversationId` | string |
| `status` | `"active"` \| ... |
| `startedAt`, `completedAt` | timestamp \| null |
| `feedback` | — \| null |
| `createdAt`, `updatedAt` | timestamp |

## `mentorshipOffers/{offerId}`

| Field | Type |
|---|---|
| `mentorId`, `studentId` | string |
| `status` | `"pending"` \| ... |
| `createdAt`, `updatedAt` | timestamp |

## `conversations/{sortedUserIdPair}`

| Field | Type |
|---|---|
| `participantIds` | array\<string\> (sorted, 2 entries) |
| `mentorshipMatchId` | string, optional |
| `lastMessage`, `lastMessageAt`, `lastMessageSenderId` | string, timestamp, string |
| `createdAt`, `updatedAt` | timestamp |

### `conversations/{id}/messages/{messageId}` — subcollection

| Field | Type |
|---|---|
| `senderId`, `receiverId` | string |
| `message` | string |
| `read` | boolean |
| `createdAt` | timestamp |

## `notifications/{notificationId}`

| Field | Type |
|---|---|
| `userId` | string |
| `type` | e.g. `"mentorship_request"`, `"mentorship_accepted"`, `"new_message"` |
| `title`, `message` | string |
| `data` | object (context ids, varies by `type`) |
| `actionUrl` | string |
| `imageUrl` | string \| null |
| `isRead` | boolean |
| `readAt` | timestamp \| null |
| `createdAt`, `updatedAt` | timestamp |

## `follows/{hash(followerId, targetId)}`

| Field | Type |
|---|---|
| `followerId`, `targetId` | string |
| `createdAt` | timestamp |

## `recommendations/{recommendationId}`

| Field | Type |
|---|---|
| `targetUserId`, `fromUserId` | string |
| `relation` | string, e.g. `"Mentor"` |
| `text` | string |
| `createdAt`, `updatedAt` | timestamp |

## `skillEndorsements/{hash(targetUserId, skill, endorserId)}`

| Field | Type |
|---|---|
| `targetUserId`, `endorserId` | string |
| `skill` | string |
| `createdAt`, `updatedAt` | timestamp |

## `businesses/{businessId}`

| Field | Type |
|---|---|
| `name`, `description`, `location` | string |
| `phone`, `email`, `website` | string \| null |
| `services` | array\<string\> |
| `ownerId` | string |
| `createdAt`, `updatedAt` | timestamp |

## `businessReviews/{reviewId}`

| Field | Type |
|---|---|
| `businessId`, `reviewerId` | string |
| `comment` | string |
| `status` | `"published"` \| `"pending"` |
| `createdAt`, `updatedAt` | timestamp |

## `departments/{departmentId}` — seeded by `npm run seed` (`departmentService.ensureSeeded()`)

Canonical list in `src/config/departmentSeeds.js`. Additive/non-destructive: admin-created departments are
kept, and existing names are never overwritten (only missing `programs` metadata is filled in).

| Field | Type |
|---|---|
| `name`, `code`, `description` | string |
| `programs` | array\<string\> |
| `programCategories` | object: `{ BSc: [...], BCom: [...] }` |
| `isActive` | boolean |
| `createdAt`, `updatedAt` | timestamp |

## `alumniRoster/{normalizedNumber-with-dashes}` — New (Step 1/3)

Document ID = normalized registration number with `/` replaced by `-` (Firestore IDs can't contain `/`),
e.g. `BIT-24-BT-ME-009`. One document per number.

| Field | Type | Notes |
|---|---|---|
| `registrationNumber` | string | Normalized, with slashes |
| `fullName` | string | Required in the upload; not checked at registration time |
| `department`, `program` | string | Optional |
| `graduationYear` | string | Optional |
| `email` | string | Optional, lower-case |
| `programCode`, `locationCode`, `entryType`, `sequence`, `admissionYear` | string | Parsed out of the number |
| `status` | `"unclaimed"` \| `"claimed"` | |
| `claimedBy` | string \| null | `users` id holding the entry |
| `claimedAt` | timestamp \| null | |
| `importBatchId` | string | `rosterImports` id of the last upload that wrote it, or `"manual"` |
| `createdAt`, `updatedAt` | timestamp | |

Claim/release run in Firestore transactions, so only one account can ever hold an entry. Imports only
touch unclaimed entries. Deleting an alumnus account releases their claim (`releaseForDeletedUser`).

## `rosterImports/{batchId}` — New (Step 1/3)

One document per real (non-dry-run) roster upload.

| Field | Type |
|---|---|
| `fileName` | string |
| `uploadedBy`, `uploadedByEmail` | string |
| `totalRows`, `errorRows`, `created`, `updated`, `skippedClaimed` | number |
| `createdAt` | timestamp |

## `auditLogs/{auditId}`

| Field | Type |
|---|---|
| `actorId`, `actorEmail` | string |
| `action` | string, e.g. `"admin.approveJob"`, `"admin.deleteEvent"` |
| `targetId` | string |
| `method`, `path` | string |
| `ip` | string |
| `createdAt` | timestamp |

---

## Registration-flow changes (Step 3)

Alumni registration now goes through the roster before falling back to the old manual-approval path:

1. `authController.register` validates the registration number format (`checkRegistrationNumber`),
   returning 400 with the `BIT/24/BT/ME/009` format hint if invalid or missing.
2. `alumniRegistration.decideAlumniRegistration` attempts to claim the number in `alumniRoster`
   (`roster.claim()`), inside a transaction.
   - **Found and unclaimed** → account created with `accountStatus: "active"`, `approvalSource: "roster"`,
     session token issued immediately.
   - **Not found, or already claimed** → account created with `accountStatus: "pending"`, no session
     token, response explains an admin will review it. Same downstream state as the pre-existing
     manual-approval path.
3. Admin hand-approval (`adminController.approveAlumni`) sets `approvalSource: "manual"`,
   `approvedBy`, `approvedAt`.
4. Roster-driven bulk approval (`rosterApproval.service.autoApprovePending`, run after every import and by
   the re-check endpoint) sets `approvalSource: "roster"` for any pending alumnus whose number has since
   appeared in the roster.
5. Deleting an alumnus (`adminController.deleteUser`) releases their claimed roster entry
   (`releaseForDeletedUser`) so the number can be claimed again — by the real owner, or by mistake if
   re-registered before the release is expected. No extra safeguard against that currently.
