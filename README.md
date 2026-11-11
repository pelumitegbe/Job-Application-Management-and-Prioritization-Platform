# Job Application Management and Prioritization Platform

A web application that helps job seekers track job applications, move them through
stages, rank them with a weighted priority algorithm, and stay on top of deadlines.

**Current status: Milestone 3A – job application CRUD API.** The backend has a
health-check endpoint, JWT-based user registration, login and session check, and an
authenticated, owner-scoped CRUD API for job applications. Prioritization, reminders
and the React frontend will be added in later steps.

## Tech stack

| Layer    | Technology                |
| -------- | ------------------------- |
| Frontend | React + Vite (not yet)    |
| Backend  | Node.js + Express         |
| Database | MongoDB + Mongoose        |
| Language | JavaScript                |

## Project structure

```text
job-application-platform/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── auth.js         # JWT secret validation, token lifetime, bcrypt work factor
│   │   │   ├── database.js     # MongoDB connection (Mongoose)
│   │   │   └── env.js          # Loads and validates environment variables
│   │   ├── controllers/        # HTTP request/response handling (health, auth, applications)
│   │   ├── middleware/         # authenticate (JWT), requestLogger (Morgan), 404 and error handling
│   │   ├── models/             # Mongoose models (User, JobApplication)
│   │   ├── routes/             # Express routers (/api/health, /api/auth, /api/applications)
│   │   ├── services/           # Business logic and database access (auth, token, application)
│   │   ├── utils/              # createHttpError helper, log redaction helpers
│   │   ├── validators/         # Request validation (auth, applications)
│   │   ├── app.js              # Express app configuration (no network I/O)
│   │   └── server.js           # Startup: load config, connect DB, start HTTP server
│   ├── test/                   # Node built-in tests (no database required)
│   │   └── integration/        # Optional tests against a real test database
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
├── frontend/                   # React app (later steps)
├── .gitignore                  # Repository-wide credential and generated-file exclusions
└── README.md
```

## Prerequisites

- **Node.js 20 or newer** (the `dev` script uses Node's built-in `--watch` flag)
- **npm**
- **A MongoDB database**, either:
  - a local MongoDB server (e.g. installed with Homebrew: `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`), or
  - a free MongoDB Atlas cluster (https://www.mongodb.com/atlas)

## Backend setup

```bash
cd backend
npm install
# Only copy if .env does not already exist:
[ -f .env ] || cp .env.example .env
```

Edit `backend/.env` and set:

| Variable      | Description                                   | Example                                              |
| ------------- | --------------------------------------------- | ---------------------------------------------------- |
| `PORT`        | Port for the API server (default `5001`)      | `5001`                                               |
| `MONGODB_URI` | MongoDB connection string (**required**)      | `mongodb://127.0.0.1:27017/job_application_platform` |
| `MONGODB_DB_NAME` | Explicit database name, overriding the URI database | `job_application_platform` |
| `FRONTEND_ORIGIN` | Allowed browser origin (default shown) | `http://localhost:5173` |
| `JWT_SECRET`  | Secret used to sign login tokens (**required**, at least 32 characters) | *(generate one – see below)* |
| `HTTP_LOGGING` | Optional. `true` or `false` to force HTTP request logging on or off (see [Logging](#logging)) | *(unset)* |

### Generating `JWT_SECRET`

The server refuses to start if `JWT_SECRET` is missing or shorter than 32 characters.
Generate a random 64-byte secret and append it to your existing `.env` **without
overwriting the file** (`>>` appends; run this once, from `backend/`):

```bash
grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")" >> .env
```

The `grep` guard prevents adding a second entry. If your `.env` was copied from
`.env.example` and already has the line `JWT_SECRET=change-me`, delete that line
first and then run the command. The secret is written straight into
`.env` and never printed. Keep it out of commits, screenshots and chat messages.
Changing it invalidates every issued token, so all users have to log in again.

The backend loads `backend/.env` regardless of the working directory; existing
shell environment variables take precedence. `atlas-credentials.env` is a private
reference file and is not loaded automatically. Leave existing credential files intact.

For MongoDB Atlas, create a cluster and database user, allow your development IP
in Network Access, and place the Atlas driver URI in `MONGODB_URI` in your local
`.env`. Percent-encode special characters in URI usernames/passwords. Do not paste
real connection strings into documentation, screenshots, logs, or commits.
`MONGODB_DB_NAME` defaults to `job_application_platform` and explicitly selects
that database even if the URI omits a database or names `test`.

Environment files and dependencies are ignored throughout the project;
`.env.example` stays trackable. Never commit real credentials. The existing
`project-review.zip` archive contains a credential-file entry and is also ignored;
avoid sharing it. Ignore rules do not remove previously committed secrets. If
credentials were shared or committed, rotate them in Atlas; review any history
cleanup separately.

## Running the backend

```bash
npm start     # production-style start
npm run dev   # restarts automatically when files change
```

On success you will see:

```text
[database] Connected to MongoDB database: job_application_platform
[server] Listening on http://localhost:5001
```

### Startup behaviour when the database is unavailable

The server connects to MongoDB **before** it starts listening for HTTP requests. If
`MONGODB_URI` is missing, or MongoDB cannot be reached within 5 seconds, the server
prints the reason and exits with status code `1`. It never reports a successful start
without a database connection. Example:

```text
[server] Startup failed: Failed to connect to MongoDB. Check credentials, network access, and Atlas configuration.
```

## Logging

### HTTP request logs (Morgan)

Every HTTP request is logged as one line in the terminal using
[Morgan](https://github.com/expressjs/morgan)'s built-in `dev` format:

```text
GET /api/health 200 4.913 ms - 68
POST /api/auth/login 200 212.402 ms - 377
GET /api/auth/me 200 61.950 ms - 121
POST /api/applications 201 98.117 ms - 452
GET /api/applications 401 0.731 ms - 55
PATCH /api/applications/6750a1b2c3d4e5f607182930 200 70.204 ms - 470
DELETE /api/applications/6750a1b2c3d4e5f607182930 204 64.380 ms - -
GET /api/nope 404 0.402 ms - 63
```

Each line has these parts:

| Part | Meaning |
| ---- | ------- |
| `GET` | HTTP method |
| `/api/applications/…` | Request path. The **query string is never logged**, so `?page=2&limit=10` doesn't appear. |
| `200` | Status code, colored: **green** 2xx success, **cyan** 3xx, **yellow** 4xx client error, **red** 5xx server error |
| `61.950 ms` | Time until the response headers were sent |
| `121` | Response body size in bytes (`-` when there's no body, e.g. `204`) |

Each request appears exactly once, including CORS preflight `OPTIONS` requests, 404s
and errors.

**What's never logged:** request bodies (so no passwords), headers (so no
`Authorization` / JWTs and no cookies), query strings, and MongoDB connection
details. Morgan's `dev` format only uses the method, URL, status, time and size. Its
`url` token is redefined in `src/middleware/requestLogger.js` to drop the query string.

**Turning it on and off:**

| Situation | Default |
| --------- | ------- |
| `npm start` / `npm run dev` | On |
| Automated tests (`npm test`, or `NODE_ENV=test`) | Off |

Set `HTTP_LOGGING` to override the default either way. Accepted values are `true`,
`false`, `1`, `0`, `on`, `off`, `yes` and `no`, in any letter case. Any other value
stops the server at startup with an error.

```bash
HTTP_LOGGING=false npm run dev                 # silence request logs for one run
```

```bash
HTTP_LOGGING=true node --test test/app.test.js # see request logs while testing
```

You can also add `HTTP_LOGGING=false` to your `.env` to make it permanent.

The colors are ANSI escape codes, which the VS Code terminal and macOS Terminal
display. If you redirect output to a file, the codes appear as raw characters.

### Error logs

Expected client errors (`400`, `401`, `404`, `409`, malformed JSON) only produce the
Morgan line above. They are part of normal operation, so no stack trace is printed.

Unexpected errors (`500`) are logged **once** by the central error handler
(`src/middleware/errorHandler.js`), together with the request line:

```text
[error] 500 GET /api/applications
Error: connection to mongodb+srv://<credentials>@cluster0.example.net failed
    at listApplications (…/src/services/applicationService.js:28:20)
    …
Caused by: …
GET /api/applications 500 3.120 ms - 49
```

- **What is logged:** the method, the path (without query string), the error name and
  message, up to three levels of `cause`, and the stack trace.
- **What isn't:** the error object as a whole, which could carry request data or
  connection details. Only those selected fields are logged.
- **Redaction:** all logged text is scrubbed of MongoDB connection-string credentials,
  `Bearer` tokens and JWT-shaped strings.
- **What the client sees:** only
  `{"status": "error", "message": "Internal server error"}`. Never a stack trace,
  error name or database detail.
- **Development vs production:** logging is the same in both. The stack trace stays
  in the server's own output, where it's needed for diagnosis in either environment.
- **Errors aren't swallowed:** an error after the response has already started
  streaming is still logged, then handed to Express's default handler, which closes
  the connection.

## Testing the health endpoint

With the server running:

```bash
curl -i http://localhost:5001/api/health
```

Expected response (HTTP 200):

```json
{
  "status": "ok",
  "message": "Job Application Platform API is running"
}
```

Unknown routes return HTTP 404 with a JSON error body, e.g.
`{"status": "error", "message": "Route not found: GET /api/nope"}`. The message shows only
the path; any query string is left out.

## Authentication API

All error responses have the form `{ "status": "error", "message": "..." }`, and
validation errors (`400`) add a field-level `errors` object (see
[Error responses](#error-responses)). Passwords and password hashes are never returned.

| Method | Path                 | Auth required | Success |
| ------ | -------------------- | ------------- | ------- |
| POST   | `/api/auth/register` | No            | 201     |
| POST   | `/api/auth/login`    | No            | 200     |
| GET    | `/api/auth/me`       | Bearer token  | 200     |

### `POST /api/auth/register`

Request body:

```json
{
  "name": "Test User",
  "email": "test@example.com",
  "password": "<at least 8 characters>"
}
```

Rules: all three fields are required strings. `email` must be a valid address and is
trimmed and lowercased before it is stored. `password` must be 8 characters to 72 bytes
long (bcrypt ignores anything beyond 72 bytes). Passwords are hashed with bcrypt at
work factor 12.

Response `201 Created`:

```json
{
  "user": {
    "id": "6650f1c2a1b2c3d4e5f60718",
    "name": "Test User",
    "email": "test@example.com",
    "createdAt": "2026-11-11T18:00:00.000Z"
  }
}
```

Errors: `400` for missing or invalid fields, and `409` if the email is already
registered. Example `400`:

```json
{
  "status": "error",
  "message": "Validation failed: name is required. email must be a valid email address. password must be at least 8 characters.",
  "errors": {
    "name": "name is required.",
    "email": "email must be a valid email address.",
    "password": "password must be at least 8 characters."
  }
}
```

### `POST /api/auth/login`

Request body:

```json
{
  "email": "test@example.com",
  "password": "<your password>"
}
```

Response `200 OK`:

```json
{
  "token": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "expiresAt": "2026-11-11T19:00:00.000Z",
  "user": {
    "id": "6650f1c2a1b2c3d4e5f60718",
    "name": "Test User",
    "email": "test@example.com",
    "createdAt": "2026-11-11T18:00:00.000Z"
  }
}
```

The token is an HS256-signed JWT. It carries only the user ID (as `sub`) plus the
issued-at and expiry times, and it expires after 1 hour.

`expiresAt` is the exact expiry as an ISO 8601 UTC timestamp. It's read from the
token's own `exp` claim, so it always matches when the server starts rejecting the
token. The frontend can use it to log the user out, or prompt them to log in again,
before requests start failing. `expiresIn` is kept for compatibility.

Errors: `400` if `email` or
`password` is missing, and `401 {"message": "Invalid email or password."}` for a wrong
password **or** an unknown email. Both cases get the same response so it cannot be
used to discover which emails are registered.

### `GET /api/auth/me`

Send the token in the header `Authorization: Bearer <token>`.

Response `200 OK`:

```json
{
  "user": {
    "id": "6650f1c2a1b2c3d4e5f60718",
    "name": "Test User",
    "email": "test@example.com",
    "createdAt": "2026-11-11T18:00:00.000Z"
  }
}
```

Errors (all `401`):
- `Authentication required.` when there's no token or the header isn't a Bearer header.
- `Invalid or expired token.` when the token is malformed, wrongly signed, uses the wrong algorithm, or has expired.
- `User account no longer exists.` when the token is valid but the user has been deleted.

### Reusing the middleware

`src/middleware/authenticate.js` can protect any route. On success it sets
`req.auth.userId`:

```js
router.get('/something', authenticate, (req, res) => { /* req.auth.userId */ });
```

### Trying it manually

With the server running (`npm run dev`), use a throwaway account. The example
password below is a placeholder, not a real credential:

```bash
curl -i -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"ChangeMe-Example-123"}'
```

```bash
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"ChangeMe-Example-123"}' \
  | node -e "process.stdin.on('data', d => process.stdout.write(JSON.parse(d).token || ''))")
```

```bash
curl -i http://localhost:5001/api/auth/me -H "Authorization: Bearer $TOKEN"
```

```bash
curl -i http://localhost:5001/api/auth/me
```

The first `me` call returns 200. The second returns 401 because it sends no token.
This test account is created in your **development** database, so delete it
afterwards in Atlas (Collections → `users`) if you don't want to keep it.

## Job Applications API

Every endpoint requires `Authorization: Bearer <token>` (from `POST /api/auth/login`).
Requests without a token, or with an invalid or expired one, get `401` as described
under [`GET /api/auth/me`](#get-apiauthme).

| Method | Path                     | Purpose                         | Success |
| ------ | ------------------------ | ------------------------------- | ------- |
| POST   | `/api/applications`      | Create an application           | 201     |
| GET    | `/api/applications`      | List your applications (paged)  | 200     |
| GET    | `/api/applications/:id`  | Get one of your applications    | 200     |
| PATCH  | `/api/applications/:id`  | Update some fields              | 200     |
| DELETE | `/api/applications/:id`  | Delete one of your applications | 204     |

### Ownership-based authorization

Each application belongs to exactly one user: the user whose JWT created it.

- **Where the owner comes from.** The owner is always taken from the verified token.
  A `user` field in a request body is rejected with `400`, and a `user` query
  parameter is rejected as unknown. An application's owner can't be changed after
  it's created.
- **How it's enforced.** Ownership is checked inside the database query itself.
  Every read, update and delete filters on `{ _id: <id>, user: <your id> }`, and the
  list filters on `{ user: <your id> }`. A record is never loaded by ID first and
  checked afterwards.
- **What other users see.** If you ask for someone else's application, you get the
  same `404 Application not found.` as for an ID that doesn't exist. The API never
  reveals whether another user's record exists.

### JobApplication schema

| Field             | Type     | Rules                                                                                      |
| ----------------- | -------- | ------------------------------------------------------------------------------------------ |
| `id`              | string   | Set by the server.                                                                         |
| `user`            | string   | Owner's user ID. Set by the server from the JWT and can't be changed.                      |
| `company`         | string   | **Required.** Trimmed, 1–150 characters.                                                   |
| `position`        | string   | **Required.** Trimmed, 1–150 characters.                                                   |
| `status`          | string   | One of `Saved`, `Applied`, `Interviewing`, `Offer`, `Rejected` (case-sensitive). Default `Saved`. |
| `location`        | string   | Optional. Trimmed, up to 200 characters.                                                   |
| `jobUrl`          | string   | Optional. Must be an absolute `http://` or `https://` URL, up to 2048 characters.          |
| `applicationDate` | date     | Optional. When you submitted the application.                                              |
| `deadline`        | date     | Optional. The submission deadline.                                                         |
| `followUpDate`    | date     | Optional. When you plan to follow up.                                                      |
| `interestLevel`   | integer  | 1–5. Default `3`.                                                                          |
| `notes`           | string   | Optional. Up to 5000 characters, stored as written (not trimmed).                          |
| `createdAt`, `updatedAt` | date | Set by the server.                                                                    |

**Dates.** Send dates as `"YYYY-MM-DD"`, which is stored as midnight UTC, or as a full
ISO 8601 date-time with a time zone, e.g. `"2026-11-30T17:00:00Z"`. Responses always
return ISO 8601 UTC strings, e.g. `"2026-11-30T00:00:00.000Z"`. Impossible dates such
as `2026-02-30`, numeric timestamps and formats like `11/30/2026` are rejected.

**Strict types.** Values are not converted for you: `"5"` isn't accepted as an
`interestLevel`, and `"applied"` isn't accepted as a `status`.

**Clearing fields.** On create and update, sending `null` or `""` for an optional field
(`location`, `jobUrl`, the three dates, `notes`) means "no value". `company`,
`position`, `status` and `interestLevel` can't be cleared.

**Future prioritization.** The schema is ready for the planned
`P = 0.40D + 0.25F + 0.20S + 0.15I` formula: `deadline` gives D, `followUpDate` gives F,
`status` gives S, and `interestLevel` gives I. No score is calculated or stored yet.

**Index.** `{ user: 1, createdAt: -1, _id: -1 }` serves the owner-scoped,
newest-first list. Lookups by `{ _id, user }` use the built-in `_id` index.

### `POST /api/applications`

Only `company` and `position` are required. Example request body:

```json
{
  "company": "Microsoft",
  "position": "Software Engineering Intern",
  "status": "Applied",
  "location": "Redmond, WA",
  "jobUrl": "https://careers.microsoft.com/",
  "applicationDate": "2026-11-11",
  "deadline": "2026-11-30",
  "followUpDate": "2026-11-20",
  "interestLevel": 5,
  "notes": "Applied through the company careers portal."
}
```

Response `201 Created`:

```json
{
  "application": {
    "id": "6750a1b2c3d4e5f607182930",
    "user": "6650f1c2a1b2c3d4e5f60718",
    "company": "Microsoft",
    "position": "Software Engineering Intern",
    "status": "Applied",
    "location": "Redmond, WA",
    "jobUrl": "https://careers.microsoft.com/",
    "applicationDate": "2026-11-11T00:00:00.000Z",
    "deadline": "2026-11-30T00:00:00.000Z",
    "followUpDate": "2026-11-20T00:00:00.000Z",
    "interestLevel": 5,
    "notes": "Applied through the company careers portal.",
    "createdAt": "2026-11-11T18:00:00.000Z",
    "updatedAt": "2026-11-11T18:00:00.000Z"
  }
}
```

Optional fields that have no value are left out of responses entirely. They aren't
returned as `null`.

### `GET /api/applications`

Query parameters (both optional):

| Parameter | Default | Rules                       |
| --------- | ------- | --------------------------- |
| `page`    | `1`     | Positive integer            |
| `limit`   | `20`    | Positive integer, max `100` |

Results are sorted newest first (`createdAt` descending, with `_id` breaking ties).
Any other query parameter is rejected with `400`. Example:
`GET /api/applications?page=2&limit=10`. Response `200 OK`:

```json
{
  "applications": [ { "id": "6750a1b2c3d4e5f607182930", "company": "Microsoft", "...": "..." } ],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 23,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": true
  }
}
```

A user with no applications gets `"applications": []` with `total: 0` and
`totalPages: 0`. Asking for a page past the end is not an error: it returns an empty
`applications` array.

### `GET /api/applications/:id`

Response `200 OK`: `{ "application": { ... } }`, in the same shape as the create response.

### `PATCH /api/applications/:id`

Send only the fields you want to change. Everything else is kept. Example:

```json
{ "status": "Interviewing", "followUpDate": "2026-12-02", "deadline": null }
```

Response `200 OK`: `{ "application": { ... } }` with the updated values. Mongoose
schema validation also runs on the update. A request is rejected with `400` if:
- the body is empty (`{}`);
- it contains an unknown field;
- it tries to set `user`, `id`, `_id`, `createdAt`, `updatedAt` or `__v`;
- any value is invalid.

### `DELETE /api/applications/:id`

Response `204 No Content` with an empty body. Only one application is deleted per
request; there is no bulk deletion.

### Status codes

| Code | When |
| ---- | ---- |
| 200  | Successful read or update |
| 201  | Application created |
| 204  | Application deleted |
| 400  | Validation failed: missing or invalid field, unknown or protected field, empty update, malformed ID (not 24 hex characters), invalid pagination, or malformed JSON (`Request body must be valid JSON.`) |
| 401  | Missing, invalid or expired token, or the token's user no longer exists (on create) |
| 404  | No application with that ID belongs to you, whether it doesn't exist or belongs to someone else |
| 500  | Unexpected server error (generic message; details are only logged on the server) |

Errors have the form `{ "status": "error", "message": "..." }`. On `400` responses an
`errors` object maps each invalid field to its message. See
[Error responses](#error-responses). Example:

```json
{
  "status": "error",
  "message": "Validation failed: company is required. interestLevel must be an integer from 1 to 5.",
  "errors": {
    "company": "company is required.",
    "interestLevel": "interestLevel must be an integer from 1 to 5."
  }
}
```

### Testing in Postman

Base URL: `http://localhost:5001`. Use a throwaway account, since anything you create
goes into your development database.

1. **Log in.** Send `POST {{baseUrl}}/api/auth/login` with a raw JSON body
   `{"email": "...", "password": "..."}`. Register first with
   `POST /api/auth/register` if you need an account.
2. **Save the token automatically.** In the login request's **Scripts → Post-response**
   tab, add:
   ```js
   pm.environment.set('token', pm.response.json().token);
   ```
3. **Send the token with every request.** In a collection (or each request), open the
   **Authorization** tab, choose **Bearer Token**, and enter `{{token}}`.
4. **Create:** send `POST {{baseUrl}}/api/applications` with the example body above,
   then copy `application.id` from the response. You can save it automatically with
   `pm.environment.set('appId', pm.response.json().application.id);`.
5. **List:** `GET {{baseUrl}}/api/applications?page=1&limit=20`.
6. **Read:** `GET {{baseUrl}}/api/applications/{{appId}}`.
7. **Update:** `PATCH {{baseUrl}}/api/applications/{{appId}}` with
   `{"status": "Interviewing"}`.
8. **Delete:** `DELETE {{baseUrl}}/api/applications/{{appId}}`. Expect `204`, and then
   `404` if you `GET` it again.
9. **Ownership check:**
   - Register and log in as a second user, and save that token as `token2`.
   - With `token2`, try to `GET`, `PATCH` and `DELETE` the first user's `{{appId}}`.
     Each should return `404`.
   - With `token2`, `GET /api/applications`. The first user's application should not
     appear in the list.
10. **Validation checks:**
    - `POST` with `{"company": "X"}` (no position) returns `400`.
    - `POST` with `"interestLevel": 7` returns `400`.
    - `PATCH` with `{}` returns `400`.
    - `PATCH` with `{"user": "<another id>"}` returns `400`.
    - `GET /api/applications/123` returns `400`.

Don't share exported Postman environments: they contain your tokens.

## Interpreting API responses (frontend guide)

The API contract as of Milestone 3B (field-level `errors`, `expiresAt`, clearer
malformed-JSON and 404 messages; every existing field was kept):

1. **Use the HTTP status code to tell success from failure.**
   - Any `2xx` is success.
   - A failure is always `4xx` or `5xx` with the body
     `{ "status": "error", "message": "<human-readable text>" }`, plus an optional
     `errors` object on `400`.
   - A successful response has no `status` field (except `/api/health`, which
     returns `"status": "ok"`).
2. **Success bodies contain the data directly under a named key:**

   | Endpoint | Success body |
   | -------- | ------------ |
   | `POST /api/auth/register` (201) | `{ user }` |
   | `POST /api/auth/login` (200) | `{ token, tokenType, expiresIn, expiresAt, user }` |
   | `GET /api/auth/me` (200) | `{ user }` |
   | `POST /api/applications` (201) | `{ application }` |
   | `GET /api/applications` (200) | `{ applications, pagination }` |
   | `GET` / `PATCH /api/applications/:id` (200) | `{ application }` |
   | `DELETE /api/applications/:id` (204) | *no body*: don't call `response.json()` |

3. **Handle errors by status code:**

   | Status | Meaning for the UI |
   | ------ | ------------------ |
   | `400` | The input was rejected. If `errors` is present, show each message next to its form field (`errors.company`, `errors.interestLevel`, ...). Otherwise show `message`, e.g. for an empty update or malformed JSON. |
   | `401` | Not logged in, or the session has expired. Clear the stored token and send the user to the login page. (On `POST /api/auth/login`, `401` means wrong email or password.) |
   | `404` | The application doesn't exist, or belongs to someone else. Show "not found" and refresh the list. |
   | `409` | The email is already registered (registration only). |
   | `413` | The request body is too large (over 100 kB). |
   | `500` | Server problem. Show a generic "something went wrong, please try again". The message is always `Internal server error`. |

4. **Messages are written for people.** They are safe to display, and never contain
   stack traces, database details, submitted values or passwords.
5. **Use `expiresAt` from login** to know when the session ends without decoding the
   JWT.
6. **Network failures have no status code.** If the server is down, `fetch` rejects
   before any of the above applies, so handle that case too.

### Error responses

```json
{
  "status": "error",
  "message": "Validation failed: company is required. jobUrl must be a valid http or https URL.",
  "errors": {
    "company": "company is required.",
    "jobUrl": "jobUrl must be a valid http or https URL."
  }
}
```

- **`status`** is always `"error"`.
- **`message`** is always present. On validation errors it still starts with
  `Validation failed:` and lists every problem in one string, exactly as before.
- **`errors`** is optional and only appears on `400` validation responses where a
  specific field is at fault. Each key is a field name and each value is that field's
  first problem.
  - Request body fields: `name`, `email`, `password`, `company`, `status`, … Unknown
    or protected fields are keyed by their own name, e.g.
    `"salary": "Unknown field: salary."` or `"user": "user cannot be set by the client."`.
  - Query parameters: `page`, `limit`, or an unknown parameter's name.
  - The URL ID: `id`.
- **When `errors` is absent:**
  - 400s with no single field at fault: an empty update body
    (`Request body must contain at least one field to update.`), a body that isn't a
    JSON object, or malformed JSON (`Request body must be valid JSON.`);
  - every `401`, `404`, `409`, `413` and `500`.
- **Never echoed back:** submitted values (including passwords), parser details and
  query strings.

## Automated tests

From `backend/`, run:

```bash
npm test
```

Tests use Node's built-in test runner and a temporary local HTTP port. They import
only the Express app, without loading `.env` or connecting to MongoDB Atlas.

- `test/app.test.js` covers health status and JSON, 404 responses, malformed JSON,
  browser CORS permissions, and OPTIONS preflight requests.
- `test/auth.test.js` makes real HTTP calls to the auth endpoints. The User model's
  database calls are swapped for an in-memory store that behaves like the unique
  email index, so bcrypt, JWT signing/verification, validation, and the routes and
  middleware all run for real. A random JWT secret is generated for each run.
- `test/authUnits.test.js` covers input validation, JWT secret checks, and the User
  schema (required fields, lowercase email, unique index, hidden hash).
- `test/applications.test.js` makes real HTTP calls to every application endpoint,
  covering authentication, validation, pagination, CRUD and ownership isolation. The
  JobApplication model's database calls are swapped for an in-memory store. That
  store:
  - matches only on the filter it receives;
  - **throws on any query without a `user` condition**;
  - runs real Mongoose schema validation on create and update.

  The suite also checks that every query included the caller's user ID, and that no
  JWT or secret was logged.
- `test/applicationUnits.test.js` covers the application validators (dates, IDs,
  pagination, strict types), the JobApplication schema and index, and how Mongoose
  errors are mapped to 400 responses.
- `test/responses.test.js` covers the response improvements:
  - field-level `errors` for auth, application, ID and pagination validation, and for
    Mongoose errors;
  - no `errors` key where no field is at fault, or on non-400 errors;
  - `expiresAt` matching the JWT `exp` claim;
  - the generic malformed-JSON message;
  - query-free 404 messages.
- `test/logging.test.js` covers Morgan request logging and server-error logging:
  - one colored line per request, with status, response time and size;
  - no query strings, passwords, JWTs, `Authorization` headers or cookies in the logs;
  - `HTTP_LOGGING` on/off and the defaults;
  - identical responses with logging on and off;
  - single, redacted 500 logs, and no logs for expected 4xx errors.

### Integration tests (optional, real database)

These run against a real MongoDB server:

- `test/integration/auth.integration.test.js` runs register → login → `me` → delete,
  and checks that the database rejects concurrent duplicate registrations.
- `test/integration/applications.integration.test.js` runs the full CRUD lifecycle
  and checks:
  - pagination order;
  - `$unset` behaviour;
  - that update validators run in the database path;
  - the owner-scoped index;
  - ownership isolation between two users.

Safeguards:
- **They're skipped unless `TEST_MONGODB_URI` is set.** They never read `MONGODB_URI`
  or `.env` themselves.
- They refuse to run unless the database name ends in `_test` (the default is
  `job_application_platform_test`).
- They only create users with `@integration-test.invalid` emails, and afterwards delete
  only the users from their own run and the applications those users own.

```bash
TEST_MONGODB_URI="<connection string for a test cluster or local MongoDB>" npm run test:integration
```

You can reuse your Atlas cluster: the tests then write to the separate
`job_application_platform_test` database, never to `job_application_platform`. To
reuse the URI from your `.env` without typing it or printing it, run this from
`backend/`:

```bash
TEST_MONGODB_URI="$(node -e "process.stdout.write(require('dotenv').parse(require('fs').readFileSync('.env')).MONGODB_URI)")" npm run test:integration
```

Don't paste the connection string anywhere it could be recorded.

CORS permits browser access from `FRONTEND_ORIGIN` only, with no credential
support. A disallowed origin receives a nonmatching allow-origin header, so the
browser blocks response access. CORS is a browser policy, not authentication;
clients such as curl can still access the API without an Origin header.
