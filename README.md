# Job Application Management and Prioritization Platform

A web application that helps job seekers track job applications, move them through
stages, rank them with a weighted priority algorithm, and stay on top of deadlines.

**Current status: Milestone 5C – time-zone-aware scoring and automatic refresh.** The
backend ranks each user's applications with an explainable weighted score
(`GET /api/applications/priorities`; see [Priority scoring](#priority-scoring)), and
the frontend shows that ranking on a [Priorities page](#priorities-page-priorities)
and in the dashboard's **Top priorities** card. "Today" now follows each user's
chosen time zone, and priorities refresh themselves at local midnight (see
[Time zones and automatic refresh](#time-zones-and-automatic-refresh)). The frontend can also list
(paginated), view, add (one or many), edit and delete applications and shows real
dashboard statistics.
- **Backend:** a health check, JWT authentication, an owner-scoped CRUD API for job
  applications, and the priority-scoring endpoint.
- **Frontend (React + Vite):** registration, login, session handling, protected
  routing, and a dashboard shell.

Follow-up reminders and notifications come in a later milestone.

**Quick start:** see [Running the app locally](#running-the-app-locally).

## Tech stack

| Layer    | Technology                |
| -------- | ------------------------- |
| Frontend | React 19 + Vite + React Router, Tailwind CSS v4, shadcn/ui-style components, Lucide icons, Inter |
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
│   │   ├── services/           # Business logic and database access (auth, token, application, priorityScoring)
│   │   ├── utils/              # createHttpError helper, log redaction helpers, timezone.js (IANA validation, local calendar date)
│   │   ├── validators/         # Request validation (auth, applications)
│   │   ├── app.js              # Express app configuration (no network I/O)
│   │   └── server.js           # Startup: load config, connect DB, start HTTP server
│   ├── scripts/demoData.js     # Development demo data: inspect / seed / verify / remove
│   ├── test/                   # Node built-in tests (no database required)
│   │   └── integration/        # Optional tests against a real test database
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── illustrations/  # Original SVG illustrations (tracking board, empty-state scenes)
│   │   │   ├── applications/   # StatusBadge, InterestLevel, ApplicationList, Pagination, ApplicationFormDialog (add/edit), ApplicationDetailsSheet, DeleteApplicationDialog, BulkApplicationRow
│   │   │   ├── dashboard/      # StatsOverview, RecentApplications
│   │   │   ├── ui/             # shadcn/ui-style primitives: button, input, textarea, native-select, label, card, badge, alert, dialog, sheet, separator
│   │   │   ├── common/         # App components built on ui/: Button (loading), FormField, TextField, PasswordField, Alert, EmptyState, IconTile, Spinner, Logo
│   │   │   ├── layout/         # AuthLayout, AppLayout (sidebar + header), SidebarNav, navigation.js
│   │   │   └── routing/        # ProtectedRoute, GuestRoute
│   │   ├── constants/applications.js # Statuses, field limits, page size, status badge colours (mirror the backend)
│   │   ├── context/
│   │   │   ├── AuthContext.jsx # Current user, session status, login/logout, expiry timer
│   │   │   └── ToastContext.jsx # Success/error toast notifications
│   │   ├── hooks/              # useAuth, useFormSubmission, useApplications, useApplicationStats, usePriorities, usePriorityAutoRefresh
│   │   ├── pages/              # Login, Register, Dashboard, Applications, BulkAddApplications, Priorities, Settings, NotFound
│   │   ├── services/
│   │   │   ├── api.js          # Central fetch client (base URL, JSON, Bearer token, errors)
│   │   │   ├── authService.js  # register / login / me API calls
│   │   │   ├── applicationService.js # list / get / create / update / delete, and bounded fetch-all for statistics
│   │   │   └── tokenStorage.js # sessionStorage for the JWT and its expiry
│   │   ├── lib/                # utils.js (cn helper), tones.js (accent colours), useReturnFocus.js (dialog focus return)
│   │   ├── styles/global.css   # Tailwind import, design tokens, base styles
│   │   ├── utils/              # validation.js (auth forms), applicationForm.js (add/edit form), bulkApplications.js, applicationStats.js, priorityInsights.js, timezone.js, formatters.js
│   │   ├── test/               # Vitest + React Testing Library tests
│   │   ├── config.js           # App name, VITE_API_BASE_URL lookup
│   │   ├── App.jsx             # Routes
│   │   └── main.jsx            # Entry point (router + auth provider)
│   ├── .env.example
│   ├── components.json         # shadcn/ui configuration (JavaScript, zinc, Lucide)
│   ├── jsconfig.json           # "@/..." import alias for editors
│   ├── index.html
│   ├── package.json
│   └── vite.config.js          # Dev server on port 5173, test configuration
├── .gitignore                  # Repository-wide credential and generated-file exclusions
└── README.md
```

## Prerequisites

- **Node.js 20 or newer** (the `dev` script uses Node's built-in `--watch` flag)
- **npm**
- **A MongoDB database**, either:
  - a local MongoDB server (e.g. installed with Homebrew: `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`), or
  - a free MongoDB Atlas cluster (https://www.mongodb.com/atlas)

## Running the app locally

The frontend and backend are **separate applications** during development. Run each
in its own terminal.

| App      | Folder      | URL                     | Start command  |
| -------- | ----------- | ----------------------- | -------------- |
| Backend  | `backend/`  | `http://localhost:5001` | `npm run dev`  |
| Frontend | `frontend/` | `http://localhost:5173` | `npm run dev`  |

**One-time setup:**

```bash
cd backend && npm install
```

```bash
cd frontend && npm install && ([ -f .env ] || cp .env.example .env)
```

Then follow [Backend setup](#backend-setup) to configure `backend/.env`.

**Terminal 1 (backend):**

```bash
cd backend && npm run dev
```

**Terminal 2 (frontend):**

```bash
cd frontend && npm run dev
```

Open **http://localhost:5173**. The frontend calls the backend at the URL in
`frontend/.env`. The backend only accepts browser requests from `FRONTEND_ORIGIN`,
which defaults to `http://localhost:5173`. That's why the Vite dev server is pinned to
port 5173 with `strictPort`: if the port is taken, Vite fails instead of moving to a
port the backend would reject.

## Frontend

### UI and design system

**Visual direction (Milestones 4A.2 and 4B.1):** a colourful but restrained SaaS look on
a predominantly white and light-gray interface. Colour is kept for components that
matter: buttons, icons, badges, banners and illustrations.

| Role | Colour |
| ---- | ------ |
| Brand | Electric purple `#7c3aed` → royal blue `#2563eb`, used as a gradient on primary buttons, the brand mark, the login/register showcase and the dashboard welcome banner |
| Accents | Teal `#14b8a6`, coral `#ff7a59`, amber `#f59e0b` |
| Canvas (4B.1) | App background `#FAFBFC`, sidebar `#F8FAFC`, cards `#FFFFFF`, borders `#E5E7EB`, text gray-900/600/500 |

**Accent colours by feature:** every feature keeps the same colour everywhere,
defined once in `src/lib/tones.js`:
- applications: blue
- priorities and deadlines: coral
- follow-ups: amber
- interviews: teal

"Coming soon" markers are always amber.

**Styling:**
- Tailwind CSS v4 through `@tailwindcss/vite`, with no `tailwind.config.js`.
- Tokens are CSS variables in `src/styles/global.css`, mapped with `@theme inline`.
- Brand gradients are custom utilities (`bg-brand-gradient`, `bg-brand-soft`,
  `text-brand-gradient`) defined with `@utility`.
- Shadows are soft and neutral.

**Components** follow the [shadcn/ui](https://ui.shadcn.com) pattern:
- Their source lives in `src/components/ui/`, using `cva` variants and `cn()`.
- `components.json` is set up for JavaScript.
- Radix Dialog powers the mobile navigation drawer and the "Add application" modal.
- Icons are `lucide-react`.
- The font is self-hosted Inter Variable.

**Illustrations** are original inline SVG and HTML in
`src/components/illustrations/`. There are no stock images or image files.
- `TrackingBoardIllustration`: an application board with four stage columns, a card
  moving between stages, and a rising priority chart. It's used in the auth
  showcase and the dashboard banner.
- `EmptyStateIllustration`: small folder, calendar and bell scenes in each accent
  colour, used by the reusable `EmptyState` component.
- `AuthShowcase` (in `components/layout/`): the login/register right column. It
  shows product messaging plus floating *example* cards (priority ranking, stage
  progress, a follow-up chip). Those are illustrative sample content, hidden from
  screen readers and described by a caption; they're never user data. The cards
  float gently only when the user hasn't asked for reduced motion.

**Layout:**
- **Login and register** both render through `AuthLayout`, so they're identical apart
  from title, subtitle, fields and actions.
  - Desktop: a form card on the left and the gradient showcase on the right.
  - Below 1024px: a compact gradient header with the form card overlapping it.
- **Dashboard:**
  - **Sidebar:** light gray, with colour-coded icon tiles and a "Next up" roadmap
    note. The sidebar becomes a slide-over drawer below 1024px.
  - **Main area:**
    - a gradient welcome banner (about 235px tall on desktop) with **Add application**
      and **View applications** actions;
    - four colour-coded statistic cards with real values;
    - "Recent applications" (or an empty state);
    - the **Top priorities** card (see [Dashboard: Top priorities](#dashboard-top-priorities));
    - deadline and follow-up empty states;
    - the account card.
- **Sidebar links:** **Dashboard**, **Applications** and **Priorities** (a
  sorted-list icon) are links. Follow-ups is a non-interactive item (`aria-disabled`,
  an amber "Soon" badge).
- **Dashboard placeholders:** the upcoming-deadline and follow-up reminder cards are
  still labelled **Coming soon**.

**Accessibility:**
- **Focus:** every control has a visible 3px focus ring, and there's a "Skip to
  content" link.
- **Fields:** each has a `<label>`, and errors are linked with `aria-describedby` and
  `aria-invalid`.
- **Announcements:** alerts use `role="alert"` or `role="status"`.
- **Contrast:**
  - all text meets WCAG AA (4.5:1 or better); on the neutral palette, body text is
    17:1, secondary text #4b5563 is 7.2:1 or better, and the lightest gray #6b7280
    is 4.6:1 or better (it isn't used on #f3f4f6);
  - status badges are 5.9–9.4:1;
  - white text on the brand gradient is 5.2–5.8:1;
  - chips on gradients use a dark violet tint (6.5:1 or better) rather than a white
    tint, which fell below 4.5:1;
  - coral and amber are used as fills, with darker shades for text;
  - form-field borders are 3.1:1;
  - the focus ring is violet.
- **Touch targets:** at least 40px on small screens.
- **Reduced motion:** `prefers-reduced-motion` turns animations and transitions off.

### Environment variables

| Variable            | Required | Example                 | Description |
| ------------------- | -------- | ----------------------- | ----------- |
| `VITE_API_BASE_URL` | Yes      | `http://localhost:5001` | Backend base URL, with no trailing slash |

Put it in `frontend/.env`, which is git-ignored; copy it from `frontend/.env.example`.
Only `VITE_`-prefixed variables reach the browser, and they are **built into the
JavaScript bundle**, so never put secrets there. A variable set in your shell overrides
`.env`, e.g. `VITE_API_BASE_URL=http://localhost:5098 npm run dev`.

### Scripts (run in `frontend/`)

| Command              | What it does |
| -------------------- | ------------ |
| `npm run dev`        | Starts the Vite dev server on http://localhost:5173 with hot reload |
| `npm test`           | Runs the test suite once (Vitest + React Testing Library, in jsdom) |
| `npm run test:watch` | Re-runs tests as you edit files |
| `npm run build`      | Builds the production bundle into `frontend/dist/` |
| `npm run preview`    | Serves the built `dist/` on http://localhost:5173, to check a build |

`VITE_API_BASE_URL` is read when you run `npm run build`. Set it to the production API
URL before building for deployment.

### Routes

| Path         | Who can see it | Behaviour |
| ------------ | -------------- | --------- |
| `/`          | Everyone       | Redirects to `/dashboard` if logged in, otherwise `/login` |
| `/login`     | Logged-out users | Logged-in users are redirected to the dashboard |
| `/register`  | Logged-out users | Same as `/login` |
| `/dashboard` | Logged-in users | Logged-out users are redirected to `/login`; after logging in they return here |
| `/applications` | Logged-in users | The user's job applications; `?page=N` selects the page |
| `/applications/bulk` | Logged-in users | Add several applications at once |
| `/priorities` | Logged-in users | Ranked applications; `?category=`, `?status=`, `?rejected=1` and `?page=N` keep the filters and page |
| `/settings` | Logged-in users | Time zone preference |
| anything else | Everyone      | "Page not found" |

While a stored session is being checked, protected and guest routes show
"Checking your session…" instead of redirecting too early. Refreshing the page on
`/dashboard` keeps you there as long as the session is still valid.

### Applications page (`/applications`)

**Listing:**
- Fetches `GET /api/applications?page=N&limit=10` through the shared API client, so
  the Bearer token is added automatically.
- Shows each application's position, company, status, location, application date,
  deadline and interest level, plus a link to the job posting when one is saved.
- Missing values show as "—".
- Dates come back from the API as midnight UTC (the backend stores `YYYY-MM-DD` that
  way), so they're formatted in UTC to show the same calendar day the user entered.
- **Status badges** always show the status as text; colour is never the only cue:

  | Status | Colour |
  | ------ | ------ |
  | Saved | gray |
  | Applied | blue |
  | Interviewing | teal |
  | Offer | green |
  | Rejected | red |

**Responsive layout:**
- From 768px up, a table (`ApplicationList`). The Location column appears from
  1024px.
- Below 768px, a stack of cards with no horizontal scrolling.
- Both are rendered and CSS hides the one that doesn't fit. `display: none` also
  hides it from screen readers.

**Pagination** is driven entirely by the backend's `pagination` metadata
(`page, limit, total, totalPages, hasNextPage, hasPrevPage`):
- The page lives in the URL (`?page=2`), so refresh and the browser's back button
  work. An invalid value means page 1.
- Previous and Next are disabled using `hasPrevPage`/`hasNextPage`. The footer shows
  "Showing 11–20 of 23" and "Page 2 of 3".
- Only the requested page is fetched; the client never downloads everything to
  paginate locally.
- While the next page loads, the current rows stay visible but dimmed.
- A page past the end (e.g. `?page=99`) jumps to the last page.

**States:**
- **Loading:** skeleton rows announced as "Loading applications…".
- **Empty:** an illustration with an **Add application** button.
- **Error:** a readable message with **Try again**. It distinguishes network
  failures, server errors, unexpected response shapes and backend validation
  messages.
- **401:** ends the session, as on every other page (back to `/login` with "Your
  session is no longer valid").

### Adding an application

**Add application** opens a modal (`ApplicationFormDialog`, built on Radix Dialog).
The same dialog is used on the Applications page and from the dashboard's welcome
banner.
- **Accessibility:** focus moves into the dialog and is trapped there; Escape,
  Cancel or × close it without saving; focus then returns to the button. On phones
  it becomes a bottom sheet with Save and Cancel fixed at the bottom.
- **Fields** use the backend's exact names and rules:

  | Field | Control | Rule |
  | ----- | ------- | ---- |
  | `company` * | text | required, ≤ 150 |
  | `position` * | text | required, ≤ 150 |
  | `status` | select | Saved (default), Applied, Interviewing, Offer, Rejected |
  | `location` | text | optional, ≤ 200 |
  | `jobUrl` | url | optional, must start with `http://` or `https://` |
  | `applicationDate`, `deadline`, `followUpDate` | date picker | optional, sent as `YYYY-MM-DD` |
  | `interestLevel` | 1–5 segmented radio group | default 3 |
  | `notes` | textarea | optional, ≤ 5000 |

  Required fields have a red asterisk and the `required` attribute.
- **Client-side validation** runs before any request. It checks required fields,
  lengths, URL format and dates, shows messages under each field (linked with
  `aria-describedby`) and focuses the first invalid field.
- **What's sent:** trimmed values. Empty optional fields are left out of the request
  body entirely.
- **Server-side validation is still authoritative.** The backend's field-level
  `errors` are shown beside the matching inputs, with field names replaced by their
  labels, e.g. "Job posting URL must be a valid http or https URL.". Errors for
  fields the form doesn't show, and other API errors, appear in the form's alert.
- **While saving:** the button shows "Saving…", and the form, Cancel and the close
  button are disabled, so double clicks or Enter can't create duplicates.
- **On success (`201`):**
  - a toast says "Application added";
  - the dialog closes;
  - the list refreshes and goes back to page 1, where the new application appears
    first, since the backend lists newest first.
  - From the dashboard, the toast also offers a **View applications** link.
- **Network failures** keep the form open with the values intact. **401** ends the
  session.

### Adding multiple applications

**Add multiple**, next to **Add application** on the Applications page, opens a dedicated
page, `/applications/bulk`. A page was chosen over a dialog because it handles 10–20
entries better on phones, has its own URL, and returning to the list refreshes it.

**Entry:**
- It starts with **three empty, numbered cards** ("Application 1", 2, 3…).
  - **Add another** adds a card, up to **20**, and focuses its Company field.
  - The trash icon removes a card. The rest renumber, and at least one card always
    remains.
  - **Remove empty rows** clears any cards you haven't typed in.
- **Each card has every create field,** with the backend's names and rules:
  - Company \* and Position \* (required);
  - Status (default Saved) and Interest level (1–5, default 3), as selects;
  - Location, Job posting URL and Notes;
  - Application date, Deadline and Follow-up date, as date pickers.
- **Layout:** one column on phones, two on tablets, four on desktop. The Create/Cancel
  bar stays pinned to the bottom. White cards on the neutral background, with the
  brand gradient on the primary button.

**Validation:**
- Every unsent card is checked with **the same rules as the single form**
  (`validateApplicationForm`): required fields, lengths, URL format and real
  calendar dates.
- **Errors** appear beside the affected field in the affected card, and focus moves
  to the first one.
- **If any card is invalid, nothing is sent.** Empty cards count as invalid; they're
  never silently skipped. Remove them or fill them in.

**Submission and retry:**
- **One request at a time:** each card goes to the existing
  `POST /api/applications`, sequentially, never in parallel. No new backend endpoint
  was added.
- **Progress** is announced ("Creating 2 of 5 applications…"), and the cards and
  buttons are locked while it runs, so nothing can be submitted twice.
- **Created cards** turn green, collapse to a "Created" summary, and are **never sent
  again**.
- **Failed cards** (backend validation errors or a network failure) are marked "Not
  created". They keep their values, show backend field errors beside the fields and
  any other message on the card, and the batch carries on with the remaining cards.
- **The summary** reads either "All N applications created" or "X created, Y not
  created". The button becomes **Retry N applications**, which sends only the cards
  that haven't been created.
- **A 401** stops the batch immediately: unsent cards aren't sent, and the session ends
  as everywhere else.
- **On success,** a toast offers **View applications**. When everything is created,
  the page offers **View applications** or **Start a new batch**. The Applications page
  refetches when you return, so the new entries appear.

### Viewing application details

Click a position in the list, or **Details** on a phone card, to open a side sheet.
The sheet is full width on phones.
- **Fresh data:** it loads the application with `GET /api/applications/:id`.
- **What it shows:**
  - company, position and status;
  - location and a job posting link (opens in a new tab);
  - application date, deadline and follow-up date;
  - interest level;
  - notes, with line breaks kept;
  - created and last-updated timestamps, in local time.

  Missing optional fields read "Not set".
- **Actions:** **Edit** and **Delete**.
- **If it no longer exists** (404, e.g. deleted in another tab), the sheet says so, a
  toast appears and the list refreshes.
- **Accessibility:** it's a Radix dialog with a focus trap and Escape to close, and
  focus returns to the button that opened it.

### Editing applications

Open **Edit** from a row's pencil icon, a phone card or the details sheet. It reuses
the add form (`ApplicationFormDialog` in edit mode):
- **Fresh data:** it loads the latest version with `GET /:id` first, so it never edits
  stale data. If the application was deleted elsewhere, it shows "Application not
  found".
- **Every supported field can be edited,** including **status**: Saved, Applied,
  Interviewing, Offer or Rejected (the exact backend enum; badge colours unchanged).
  Ownership and ID fields are never sent.
- **Validation** is the same as for adding, plus the backend's field-level errors
  beside each input.
- **Clearing a field:** emptying an optional field (location, job URL, any date,
  notes) sends `null`, which the backend removes with `$unset`. Company, position,
  status and interest level can't be cleared.
- **Only changed fields are sent** in the `PATCH /api/applications/:id` body. If
  nothing changed, no request is made and the form says so.
- **While saving,** "Saving…" shows and Cancel and close are disabled.
- **On success:** a "Changes saved" toast, then the current page reloads, so you stay
  on the page you were on.
- **Concurrent edits:** the backend has no version check, so the last save wins.
  Sending only the changed fields keeps an edit from overwriting other fields changed
  elsewhere.

### Deleting applications

**Delete** (trash icon, phone card button, or the details sheet) opens an accessible
confirmation dialog (`role="alertdialog"`, not `window.confirm()`):
- **It names the application** ("Frontend Engineer at Northwind Labs will be
  permanently deleted. This can't be undone.").
- **Safe defaults:** focus starts on **Cancel**, and Escape cancels.
- **While the request runs,** both buttons are disabled and the dialog can't be
  dismissed.
- **`204 No Content`** is handled without trying to parse a body. A "Application
  deleted" toast appears and the list refreshes.
- **Last item on a page:** deleting the only item on a page after the first moves to
  the previous page. Deleting the very last application shows the empty state.
- **Errors:**
  - **404** (already deleted elsewhere): a toast, then a refresh;
  - **401**: ends the session;
  - **network failure**: an error inside the dialog, which stays open for a retry.

### Dashboard statistics

The four statistic cards are computed from the signed-in user's own applications:

| Statistic | Definition (backend status enum) |
| --------- | -------------------------------- |
| Total applications | Every application. Taken from the backend's `pagination.total`, so it's always exact. |
| In progress | **Applied + Interviewing**: submitted and still awaiting an outcome. Saved (not yet applied) and Offer/Rejected (outcomes) are excluded. |
| Interviews | **Interviewing** |
| Offers | **Offer** |

The definitions live in `src/utils/applicationStats.js` and appear under each value on
the dashboard.

- **How the data is fetched:** the backend has no aggregate endpoint, so
  `fetchAllApplications` reads `GET /api/applications?page=N&limit=100` (the
  backend maximum) **one page after another, never in parallel**, until
  `hasNextPage` is false. It stops after **10 pages (1,000 applications)** at most.
- **The same data** feeds the "Recent applications" list: the three newest.
- **States:**
  - loading placeholders;
  - an error with **Try again**, and no numbers are shown;
  - an empty state with **Add your first application**;
  - **401** ends the session.
- **Refreshing:** statistics reload when the dashboard opens and after adding an
  application from it.

**Scalability limitations:**
- **Cost per dashboard load:** up to 10 sequential requests and 1,000 documents
  transferred. That's fine for personal use, but it gets slower as the number of
  applications grows.
- **Past 1,000 applications,** the total stays exact, but the status counts cover only
  the 1,000 most recent. The dashboard shows a note when that happens.
- **Consistency:** pages are read one after another, so an application added or
  removed during the loop can be counted twice or missed until the next refresh.
- **The proper fix** is a backend aggregate endpoint, e.g. `GET /api/applications/stats`
  using a MongoDB `$group` on `{ user, status }`. That was deliberately not added in
  this milestone, which made no backend changes.

### Priorities page (`/priorities`)

The page shows the ranking from `GET /api/applications/priorities`. **The frontend
never recalculates a score:** every number, category, factor and explanation comes from
the API's `priority` object. The frontend only chooses labels, colours and which
explanation to show first (`src/utils/priorityInsights.js`).

**Loading the ranking.** The summary cards and filters need the whole ranking. If they
worked on one page only, the totals would be wrong. The backend has no category or
status filters, so the page:
- reads the complete ranking with `includeRejected=true`, 100 per request (the
  backend maximum);
- reads the pages one after another, never in parallel;
- stops after 10 pages (**up to 1,000 applications**; `fetchAllPriorities` in
  `src/services/applicationService.js`).

If an account has more than that, a note says that counts and filters cover the top
1,000 only. Items keep the backend's order, and each item's **rank** is its position
in the full ranking. Ranks therefore stay correct when filters or paging hide other
items. For example, filtering to "Low" can show ranks #20–#23.

**Summary cards** count over the whole ranking, never just the visible page:

| Card | Counts |
| ---- | ------ |
| Actionable | Applications that are not rejected |
| High priority | Category High or Critical |
| Overdue follow-ups | `factors.followUp.overdue` is true (not rejected) |
| Upcoming deadlines | Status Saved, the deadline applies and hasn't passed, and it is 0–7 calendar days away |

The cards don't change when you filter; they describe the whole account.

**Ranked list.** Each card shows:
- the rank, position and company;
- the status badge and the interest level (five pips);
- the next action date;
- the score as **"84/100" plus a bar**. The number is always printed, so the score
  reads the same without colour. Screen readers hear "Priority score 84 out of 100";
- the category badge;
- warning badges;
- the **most relevant explanation**. For a rejected application, this is the rejection
  message. Otherwise it is the time-based factor (deadline or follow-up) with the
  largest weighted contribution. If neither applies, it is an expired Saved deadline,
  and failing that, the stage.

A coloured left edge repeats the category. On phones the score bar moves below the
details; from 768px it gets its own column.

**Categories** are always shown by name. Colour only reinforces them:

| Category | Score | Colour |
| -------- | ----- | ------ |
| Critical | 75–100 | Red |
| High | 50–74 | Orange |
| Medium | 25–49 | Blue |
| Low | 1–24 | Gray |
| No action | 0 | Muted gray |

**Warnings** come from the backend's factor details, separately from the category.
For example, an overdue follow-up is still flagged in red on a Medium item. There are
five warnings:
- **Follow-up overdue by N days** (red);
- **Follow-up due today** (amber);
- **Deadline today** (red);
- **Deadline in N days** (amber, up to 7 days);
- **Deadline passed** (gray, for an expired Saved deadline).

Rejected applications show no warnings.

**Explainable breakdown.** Selecting a card (it is one large button) opens a side
sheet with:
- the overall score and category, and the next action date;
- the formula `P = 0.40D + 0.25F + 0.20S + 0.15I`;
- a table with each factor's **score out of 100**, **weight** and **weighted
  contribution in points**, plus the total (`rawScore`);
- every explanation the backend returned, and the reference date it used;
- for rejected applications, the override ("Rejected applications always score 0"),
  with the total labelled "before override";
- **Open application details**, which opens the existing details sheet. From there,
  Edit and Delete reuse the existing dialogs, and the ranking reloads after any change.

**Filters** (all applied to the full ranking, ordered by priority):
- **Category:** All, Critical, High, Medium, Low or No action.
- **Status:** All or any status. "Rejected" is only offered when rejected
  applications are included.
- **Include rejected:** off by default. Rejected applications always rank last at
  score 0. Unticking it also clears a "Rejected" status filter.
- **Reset filters** appears when any filter is set.

Filters and the page number are kept in the URL, so they survive reloads and Back.

**Pagination** reuses the Applications page's `Pagination` component, 10 per page. It
shows "Showing 11–20 of 23" and "Page 2 of 3" for the *filtered* list. A page past the
end jumps to the last page.

**States:**
- a loading skeleton;
- "No applications to prioritise" for an empty account;
- "No applications match these filters";
- error messages with **Try again** (network, 5xx, unexpected response shape).

A **401** ends the session through the shared API client and returns to login, as on
every other page.

### Dashboard: Top priorities

The dashboard's ranking card is now live. It makes one request,
`GET /api/applications/priorities?limit=3`, without `includeRejected`, so it shows the
top three **actionable** applications. For each one it shows:
- the rank, position and company;
- the score (number and bar) and the category;
- any warnings, and the most relevant explanation.

Other details:
- **View all priorities** links to `/priorities`.
- It has its own loading skeleton, empty state, and error with **Try again**.
- Adding an application from the dashboard refreshes it.
- The statistics, recent applications, deadline and follow-up cards, and account card
  are unchanged.

### Priorities UI limitations

- **The 1,000-application cap.** Accounts with more applications get counts and filters
  over the top 1,000 only, and a note says so. Server-side filtering would need new
  query parameters on the priorities endpoint.
- **Scores refresh at local midnight, on tab return and on reconnect** (Milestone 5C;
  see [Time zones and automatic refresh](#time-zones-and-automatic-refresh)). The page
  header and the breakdown show the date and time zone the scores were computed for.
- **No reminders or notifications.** Warnings are visible only on these pages; reminders
  are a later milestone.

### Time zones and automatic refresh

Deadline and follow-up urgency depend on what "today" is. Since Milestone 5C, today is
the **calendar date in the user's chosen time zone**, not the UTC date.

**The time zone preference.**
- Each user has an optional `timezone`: an IANA name such as `America/Chicago`.
- Accounts that never chose one, including every account created before 5C, use
  **UTC**. Nothing is written to existing records. `GET /api/auth/me` returns the
  effective `timezone` and `timezoneSource`: `"default"` until the user saves a
  choice, then `"user"`.
- **Settings** (`/settings`, in the sidebar) shows:
  - the saved time zone and the current time there;
  - the browser's time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`);
  - a selector with every time zone the browser knows, grouped by region.

  **Use detected time zone** only fills in the selector. Nothing is saved until you
  press **Save** (`PATCH /api/auth/me`).
- **One-time suggestion.** When the account is still on the UTC default and the browser
  reports another zone, a banner at the top of each page asks "Use your time zone for
  priorities?". It has two buttons:
  - **Use America/Chicago** saves the browser zone.
  - **Keep UTC** saves UTC as a deliberate choice.

  Either choice is stored, so the banner doesn't return. A saved preference is never
  overwritten automatically.

**How the reference date is determined.**
1. The priorities endpoint loads the signed-in user's time zone, which is UTC if none
   is saved.
2. It takes the current instant and finds its calendar date in that zone with
   `Intl.DateTimeFormat`. For example, 03:00 UTC on Nov 30 is still Nov 29 in Chicago.
3. That date is passed to the unchanged, pure scoring engine as midnight UTC of the
   date (`referenceDate`).

The formula, weights, ranges, categories, explanations and the rejected rule are
exactly as before. The response's `scoring` object now also contains `timezone`:

```json
"scoring": { "formula": "P = 0.40D + 0.25F + 0.20S + 0.15I", "referenceDate": "2026-11-29", "timezone": "America/Chicago", "includeRejected": false }
```

**How date-only fields are interpreted.**
- `deadline`, `followUpDate` and `applicationDate` are **calendar dates**, not instants.
- A date entered as `2026-11-30` is stored as `2026-11-30T00:00:00.000Z`, as before.
- These dates are never converted to a time zone. The backend compares them by their
  UTC date, and the frontend formats them in UTC. **Nov 30 is Nov 30 for every user,
  in every browser**, and never shows as Nov 29 in Chicago, New York or Los Angeles.
- The edit form's date inputs use the same UTC date.
- Real timestamps (`createdAt`, `updatedAt`) are still shown in the browser's local
  time.

**When priority scores refresh automatically.** Both the Priorities page and the
dashboard's Top priorities refresh:
- **at local midnight** in the time zone the scores were computed for, plus 2 seconds
  so the server has certainly passed midnight. The next refresh is scheduled after
  every load;
- **when you return to the tab**, but only if the local date has changed since the
  scores were computed;
- **when the browser reconnects**, if the date has changed or the last load failed;
- **after creating, editing or deleting an application**, including each application
  in a bulk batch. The application service announces each change
  (`services/applicationEvents.js`), and the priority views reload. There is no
  global store;
- **after you change your time zone.** The views reload, and midnight is
  rescheduled for the new zone.

Request safety:
- At most one request runs at a time. A newer load aborts the older one, and only
  the newest response may update the page.
- Several triggers in the same moment are merged into one request.
- Timers and listeners are removed when the page unmounts.
- There is no polling. Outside these events, nothing is requested.

**Daylight saving.**
- The backend never adds 24 hours. It asks for the calendar date of an instant in the
  zone, so 23- and 25-hour days are handled.
- The frontend finds the next local midnight by binary search on the real local date,
  not by adding 24 hours. In Chicago, the next refresh after midnight on Mar 8 2026 is
  23 hours later, and after midnight on Nov 1 2026 it is 25 hours later.
- In zones where clocks jump at midnight (e.g. `America/Santiago`), the refresh happens
  at the first instant of the new day.

**Limitations.**
- The browser schedules the midnight refresh with its own clock. If that clock is wrong,
  the refresh comes early or late. Tab return and reconnect still catch up.
- A sleeping computer or a throttled background tab can delay the timer. The
  visibility check refreshes as soon as you return.
- Time zone names come from the runtime's time zone database (ICU). A zone the
  browser lists but the server's Node.js doesn't know is rejected with a 400.
  Deprecated aliases such as `US/Pacific` are accepted and stored under their current
  name.
- Dates sent as full ISO date-times with an offset (not by this UI) are stored as
  instants. Their calendar day is then their UTC date, as before.
- Dates are shown in a fixed short format. Timestamps use the browser's zone rather
  than the saved one.

### How authentication works

1. **Register:** `POST /api/auth/register` with name, email and password.
   - The form checks the same rules as the backend before sending (required fields,
     email format, a password of at least 8 characters, matching confirmation).
   - The backend's field-level `errors` are shown under the matching inputs. A `409`
     (email already registered) is shown on the email field.
   - On success you are sent to the login page with your email filled in. You are
     **not** logged in automatically, because the register endpoint doesn't issue a
     token.
2. **Log in:** `POST /api/auth/login`.
   - The response's `token` and `expiresAt` are saved in **`sessionStorage`**, and the
     `user` from the response is kept in React state.
   - Wrong email and wrong password show the same backend message:
     `Invalid email or password.`
3. **Using the session:** `src/services/api.js` adds `Authorization: Bearer <token>`
   to API requests. Login and register are sent without a token.
4. **When the app loads with a stored token,** it calls `GET /api/auth/me` before
   treating you as logged in. The JWT is never decoded or trusted on its own; only the
   server's answer counts.
   - `401`: the token is invalid, expired or the account was deleted. The token is
     removed and you see "Your session is no longer valid".
   - Server unreachable: you stay logged out with a message, and the token is kept so
     a later reload can try again.
   - A stored token past its `expiresAt` is discarded without calling the server.
5. **Expiry:** a timer logs you out at `expiresAt`, the backend's exact token expiry
   (1 hour after login). Any authenticated request that gets `401` also ends the
   session. That handler only clears state, and the route guards do the redirecting,
   so there can't be a redirect loop.
6. **Log out** clears `sessionStorage` and the in-memory user, then returns to
   `/login`.

**Token storage and its limits.** `sessionStorage` is cleared when the browser tab is
closed, and each tab has its own session. It is still **readable by any JavaScript
running on the page**, so a cross-site scripting (XSS) vulnerability could steal the
token. It is **not** equivalent to an `HttpOnly` cookie, which page scripts cannot
read. Moving to `HttpOnly` cookies would need backend changes: setting the cookie, CSRF
protection and credentialed CORS. React's default escaping of rendered text is the
main XSS protection here.

**What is never stored or logged:** passwords (they only live in form state until
submitted, and a failed login clears the password field), JWTs (no `console`
logging), and user details (only the token and expiry go into `sessionStorage`).

### API client (`src/services/api.js`)

- **Requests:** prefixes paths with `VITE_API_BASE_URL`, sends and accepts JSON, and
  adds the Bearer token unless `auth: false`.
- **Responses:** `204` (and empty bodies) return `null` without JSON parsing.
- **Errors:**
  - an HTTP error throws **`ApiError`**, with `status`, the backend's `message` and
    `fieldErrors` (the backend's `errors` object);
  - a response that isn't JSON gets a readable fallback message;
  - no response at all (server down, CORS failure, or a 15-second timeout) throws
    **`NetworkError`**, so the UI can tell "can't reach the server" apart from "the
    server said no".
- **No retries,** so a `POST` can never be sent twice by accident.

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
    "createdAt": "2026-11-11T18:00:00.000Z",
    "timezone": "UTC",
    "timezoneSource": "default"
  }
}
```

`timezone` is the effective IANA time zone used for priority scoring, which is `UTC`
until the user chooses one. `timezoneSource` is `"default"` or `"user"`. The same two
fields appear in the login and register responses.

Errors (all `401`):
- `Authentication required.` when there's no token or the header isn't a Bearer header.
- `Invalid or expired token.` when the token is malformed, wrongly signed, uses the wrong algorithm, or has expired.
- `User account no longer exists.` when the token is valid but the user has been deleted.

### `PATCH /api/auth/me`

Updates the signed-in user's **own** preferences. Only `timezone` can be changed here.
The user is always the token's user; there is no id in the URL or body.

```json
{ "timezone": "America/Chicago" }
```

- `timezone` must be an IANA identifier the server's runtime knows, such as
  `America/Chicago`, `Asia/Kolkata` or `UTC`.
  - Letter case is corrected, and `Etc/UTC` becomes `UTC`.
  - Offsets like `+05:00`, unknown names, empty values and non-strings return `400`
    with `errors.timezone`.
- Any other field (`email`, `password`, `id`, …) returns `400` with an error for that
  field, and nothing is saved.
- `200 OK` returns `{ "user": { … } }` in the same shape as `GET /api/auth/me`.
- `401` for a missing or invalid token, or `User account no longer exists.`

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

## Priority scoring

`GET /api/applications/priorities` ranks the signed-in user's applications by an
explainable priority score. The logic is a pure, independently tested module,
`backend/src/services/priorityScoring.js`:
- It doesn't use Express, the database or the system clock; the caller passes the
  reference date.
- The controller passes "now", and the service applies it to the user's applications.
- **Scores are never stored.** They're recalculated on every request, because urgency
  changes from day to day. The MongoDB schema is unchanged.

### Formula

```text
P = 0.40·D + 0.25·F + 0.20·S + 0.15·I
```

Each factor is on a 0–100 scale, so P is too.
- **Precision:** P is computed at full precision as the exact integer
  `(40D + 25F + 20S + 15I)`, divided by 100 once. It's then **rounded to the nearest
  whole number**, with .5 rounding up.
- **Breakdown:** each factor's score, weight and contribution are returned alongside.

**Days** are counted by **UTC calendar date**, not by elapsed 24-hour periods. A
deadline stored as `2026-11-30` (midnight UTC) is "today" at any time on 30 November
UTC, "in 1 day" at any time on the 29th, and "passed" from 1 December.

### D: deadline urgency (weight 0.40)

This applies **only when the status is Saved**, i.e. the application hasn't been
submitted yet.

| Days until the deadline | Score |
| ----------------------- | ----- |
| Today (0) | 100 |
| 1–2 | 90 |
| 3–7 | 70 |
| 8–14 | 40 |
| 15–30 | 20 |
| More than 30 | 10 |
| No deadline | 0 |
| Deadline passed | 0 |

**Special cases:**
- **A passed deadline** scores 0, is flagged `expired: true`, and is explained ("Application
  deadline has passed (3 days ago)."). It's **not** treated as an overdue follow-up.
- **Applied, Interviewing, Offer and Rejected** applications get D = 0. Their
  explanation says the deadline no longer affects priority; no urgency message is
  generated.

### F: follow-up urgency (weight 0.25)

| Follow-up date | Score |
| -------------- | ----- |
| Overdue | 100 |
| Due today | 100 |
| In 1–2 days | 85 |
| In 3–7 days | 60 |
| In 8–14 days | 30 |
| More than 14 days away | 10 |
| No follow-up date | 0 |

### S: stage (weight 0.20) and I: interest (weight 0.15)

| Status | S |
| ------ | - |
| Saved | 40 |
| Applied | 60 |
| Interviewing | 90 |
| Offer | 100 |
| Rejected | 0 |

**I = interestLevel × 20**, so levels 1–5 give 20, 40, 60, 80 or 100.

### Special rules

- **Rejected** applications always score **0** and are categorised **"No action"**,
  whatever their dates or interest.
  - Their single explanation is "Application is rejected and requires no further
    action."
  - The underlying weighted sum is still reported as `rawScore`, with an `override`
    note, for transparency.
  - They're **excluded from the ranking by default**, in the database query itself.
    Add `?includeRejected=true` to include them; they then rank last.
- **Missing dates** contribute 0. No date is ever invented.

### Categories

| Score | Category |
| ----- | -------- |
| 75–100 | Critical |
| 50–74 | High |
| 25–49 | Medium |
| 1–24 | Low |
| 0 | No action |

### Ranking and tie-breaking

1. **Priority score**, highest first.
2. **Next action date**, earliest first. This is the earlier of:
   - the follow-up date (an overdue one counts, so it sorts before upcoming ones);
   - the deadline, only while it still applies (status Saved and not passed).

   Applications that have a next action date rank before those that don't.
3. **Application id** in ascending order (string comparison of the ObjectId), which
   is stable and unique.

Ranking is applied to the **complete set** of the user's eligible applications.
Pagination happens afterwards, so page 2 really is ranks 11–20 of a global ordering.

### `GET /api/applications/priorities`

Requires `Authorization: Bearer <token>`. Results are always scoped to the token's
user, and passing a `user` query parameter returns 400.

| Query parameter | Default | Rules |
| --------------- | ------- | ----- |
| `page` | `1` | Positive integer |
| `limit` | `20` | Positive integer, at most `100` |
| `includeRejected` | `false` | `true` or `false` |

Any other query parameter returns `400` with the usual field-level `errors`. Each
application has the same fields as in `GET /api/applications`, plus `priority`:

```json
{
  "applications": [
    {
      "id": "6750a1b2c3d4e5f607182930",
      "user": "6650f1c2a1b2c3d4e5f60718",
      "company": "Microsoft",
      "position": "Software Engineering Intern",
      "status": "Saved",
      "deadline": "2026-11-25T00:00:00.000Z",
      "followUpDate": "2026-11-30T00:00:00.000Z",
      "interestLevel": 4,
      "createdAt": "2026-11-20T18:00:00.000Z",
      "updatedAt": "2026-11-20T18:00:00.000Z",
      "priority": {
        "score": 71,
        "category": "High",
        "rawScore": 71,
        "factors": {
          "deadline": { "score": 90, "weight": 0.4, "contribution": 36, "explanation": "Application deadline is in 2 days.", "daysUntil": 2, "expired": false, "applies": true },
          "followUp": { "score": 60, "weight": 0.25, "contribution": 15, "explanation": "Follow-up is due in 7 days.", "daysUntil": 7, "overdue": false },
          "stage": { "score": 40, "weight": 0.2, "contribution": 8, "explanation": "Application is saved but has not been submitted yet." },
          "interest": { "score": 80, "weight": 0.15, "contribution": 12, "explanation": "Interest level is 4 out of 5.", "level": 4 }
        },
        "explanations": [
          "Application deadline is in 2 days.",
          "Follow-up is due in 7 days.",
          "Application is saved but has not been submitted yet.",
          "Interest level is 4 out of 5."
        ],
        "nextActionDate": "2026-11-25"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false },
  "scoring": { "formula": "P = 0.40D + 0.25F + 0.20S + 0.15I", "referenceDate": "2026-11-23", "timezone": "UTC", "includeRejected": false }
}
```

`referenceDate` is today's calendar date in the user's time zone (`timezone`). See
[Time zones and automatic refresh](#time-zones-and-automatic-refresh).

An account with no eligible applications returns `"applications": []` with
`total: 0`.

### Worked example (reference date 2026-11-23)

Saved application, deadline 2026-11-25, follow-up 2026-11-30, interest level 4:

| Factor | Rule | Score | × Weight | Contribution |
| ------ | ---- | ----- | -------- | ------------ |
| D | Deadline in 2 days (1–2) | 90 | 0.40 | 36 |
| F | Follow-up in 7 days (3–7) | 60 | 0.25 | 15 |
| S | Saved | 40 | 0.20 | 8 |
| I | 4 × 20 | 80 | 0.15 | 12 |
| **P** | | | | **71 → High** |

The same application after it moves to **Applied** gets D = 0 and S = 60, so
P = 0 + 15 + 12 + 12 = **39 (Medium)**. If it's **Rejected**, P is **0 (No action)**.

### Demo data (development database)

`backend/scripts/demoData.js` adds 20 realistic sample applications to an **existing**
development account, so the ranking has something to show. Run it from `backend/`:

```bash
node scripts/demoData.js inspect
```

```bash
node scripts/demoData.js seed --email you@example.com
```

```bash
node scripts/demoData.js verify --email you@example.com
```

```bash
node scripts/demoData.js remove --email you@example.com
```

- **`inspect`** is read-only. It prints the database name and each user's application
  count.
- **`seed`** creates the demo applications:
  - companies include Google, Microsoft, Amazon, Meta, Apple, Netflix, Stripe and NVIDIA;
  - statuses are 5 Saved, 5 Applied, 4 Interviewing, 2 Offer and 4 Rejected;
  - dates are relative to today, so urgency is always varied: deadlines today or
    soon, overdue follow-ups, and some records with no dates.
- **`verify`** calls `GET /api/applications` and `/api/applications/priorities` through
  the real routes, in-process, and prints the totals, status distribution and
  ranking.
- **`remove`** deletes only the demo records.

**Safety:**
- It uses `backend/.env` and **refuses any database whose name ends in `_test`**.
- It never creates users and never touches non-demo applications.
- Records go through the same validation (`validateCreateApplication`) and service
  (`applicationService.createApplication`) as `POST /api/applications`, owned by the
  given user.
- Every demo record's notes start with `[DEMO DATA demo-NN]`. Seeding skips any key that
  already exists, so **rerunning never creates duplicates**.

### Known limitations

- **Every request reads all of the user's eligible applications.** Scores depend on
  the date, so they can't be stored and sorted in MongoDB; ranking happens in
  application memory. That's fine for personal-scale data (hundreds or thousands of
  applications). At much larger scale it would need an aggregation pipeline that
  computes the factors in MongoDB, or caching per reference day.
- **Day-based scores change at midnight in the user's time zone** (UTC until the user
  chooses one), so two requests either side of that midnight can rank differently.
  `scoring.referenceDate` and `scoring.timezone` show which day and zone were used.
- **The thresholds and weights are fixed** in code, as specified. They aren't
  learned or configurable per user.

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

### Backend tests

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
- `test/priorityScoring.test.js` (69 tests) unit-tests the pure scoring engine:
  - every deadline and follow-up range, at both edges;
  - missing, expired and overdue dates;
  - all five statuses and all five interest levels;
  - Rejected scoring 0;
  - the worked example and rounding at .5;
  - an exhaustive check that every score is an integer from 0 to 100;
  - category boundaries;
  - UTC calendar-day edges (23:59:59 vs 00:00, month, year and leap-day);
  - deterministic ranking with each tie-break.
- `test/priorities.test.js` (12 tests) makes real HTTP calls to
  `GET /api/applications/priorities` with a pinned clock and an in-memory store that
  throws on any query not scoped to a user. It covers:
  - authentication;
  - `/priorities` not being treated as an `:id`;
  - empty results and the exact response shape;
  - ranking order;
  - global ranking before pagination;
  - rejected applications excluded and `includeRejected`;
  - owner isolation, with a `user` query parameter rejected;
  - query validation;
  - scores never being written to the database.
- `test/timezone.test.js` (27 tests) covers Milestone 5C:
  - IANA validation: case fixing, aliases, and rejecting offsets, unknown names,
    injection-like strings and non-strings;
  - the User model validator and the UTC default for accounts without a preference;
  - the local calendar date for UTC, Chicago, New York, Los Angeles, Tokyo, Kolkata
    and Kiritimati;
  - zones ahead of UTC;
  - daylight-saving transitions (Chicago spring and fall, Sydney);
  - deadline and follow-up scores changing exactly at local midnight;
  - date-only values keeping their calendar date;
  - identical results for UTC users;
  - `PATCH /api/auth/me`: own account only, validators on, other fields rejected,
    401s;
  - the priorities metadata per time zone.
- `test/logging.test.js` covers Morgan request logging and server-error logging:
  - one colored line per request, with status, response time and size;
  - no query strings, passwords, JWTs, `Authorization` headers or cookies in the logs;
  - `HTTP_LOGGING` on/off and the defaults;
  - identical responses with logging on and off;
  - single, redacted 500 logs, and no logs for expected 4xx errors.

### Frontend tests

From `frontend/`:

```bash
npm test
```

The tests use Vitest, React Testing Library and jsdom. No backend or database is
needed: `fetch` is replaced with a mock that answers like the real API.

- `api.test.js`:
  - base URL handling, JSON headers and the Bearer token;
  - `204` handling and non-JSON responses;
  - `ApiError` vs `NetworkError`, and timeouts;
  - no retries;
  - when the 401 handler runs;
  - no console logging.
- `tokenStorage.test.js`: sessionStorage save and load, expiry, corrupt data, and
  that only the token and expiry are stored.
- `Register.test.jsx`:
  - required fields, email and password rules, and password confirmation;
  - backend field errors and the 409 duplicate email;
  - loading state and duplicate-submit prevention;
  - network errors and the password visibility toggle.
- `Login.test.jsx`:
  - success, which stores the token and expiry and opens the dashboard;
  - invalid credentials;
  - required fields, loading state and network errors.
- `timezone.test.jsx` (29 tests), with deterministic fake clocks:
  - browser time zone detection and validation;
  - next local midnight, including 23- and 25-hour days and a skipped midnight;
  - the refresh hook:
    - midnight scheduling and rescheduling;
    - time zone changes;
    - tab visibility only when the date changed;
    - reconnect;
    - no refresh while one is running;
    - timer and listener cleanup;
  - in the app:
    - a real midnight refresh on the Priorities page, with no polling afterwards;
    - tab-return and reconnect refreshes;
    - refreshes after create, update and delete, with simultaneous triggers
      merged;
    - stale responses ignored;
    - consistent multi-page reads across midnight;
  - Settings: loading, changing and saving, and server errors;
  - the one-time suggestion: no save without a click, "Use …" and "Keep UTC", and
    hidden when not needed;
  - date-only values showing as entered with the browser in Los Angeles, Chicago and
    Tokyo, in the list, details, edit value and priorities.
- `priorities.test.jsx` (28 tests), against an in-memory priorities backend in the
  real response shape:
  - rendering: backend order and global ranks, every field, the most relevant
    explanation;
  - the score shown as text plus a bar of matching width;
  - category names and colours;
  - warnings, including an overdue follow-up on a Medium item;
  - summary cards over every backend page, not just the visible page;
  - sequential 100-per-request fetching, the 10-page cap, and a malformed response;
  - the breakdown: factor scores, weights, contributions, total, explanations,
    formula, the rejected override, and opening the existing details sheet;
  - category and status filters across all pages, Include rejected, URL filters and
    Reset;
  - pagination totals and ranks on every page, and a page past the end;
  - loading, empty, filtered-empty, 500 with retry, and 401 back to login;
  - the route requiring authentication;
  - responsive classes and the mobile navigation link;
  - dashboard Top priorities: one `limit=3` request, the fields, the link, and error
    with retry;
  - the insight helpers.
- `bulkCreate.test.jsx` (16 tests) covers bulk entry:
  - opening it from the Applications page;
  - three numbered rows with defaults;
  - adding rows up to 20, and removing and renumbering them;
  - the responsive grid;
  - per-row validation: nothing sent while invalid, focus on the first error, URL
    checks, removing empty rows;
  - the exact POST payload;
  - sequential creation with progress (at most one request in flight);
  - partial failures with backend field errors;
  - retry sending only failed rows, never created ones;
  - duplicate-submit prevention;
  - 401 stopping the batch;
  - the route requiring authentication.
- `applicationManagement.test.jsx` (31 tests), against an in-memory backend that
  follows the real contract, with `:id` routes:
  - details, including "Not set" fields and 404 handling;
  - editing:
    - pre-filled values;
    - only changed fields sent;
    - status updates;
    - `null` to clear;
    - no-change notice;
    - client and backend validation;
    - page kept;
    - 404 on load or save;
    - 401;
  - deleting:
    - named confirmation and Cancel focus;
    - Cancel and Escape;
    - disabled while the request runs;
    - last item on a page;
    - the empty state;
    - 404, network failure and 401;
  - statistics:
    - the category definitions;
    - real counts;
    - every page fetched **sequentially** (at most one request in flight);
    - the 10-page cap;
    - empty state, error with retry, and 401;
  - focus returning to the button that opened each dialog.
- `applications.test.jsx` (30 tests):
  - loading, empty and listing states;
  - every field and status badge;
  - responsive table and cards;
  - pagination: next/previous, URL page, a page past the end, disabled buttons, one
    request per page;
  - errors: network with retry, 500, unexpected shape, 400, 401 back to login;
  - the form: fields, defaults, required markers, Cancel and Escape;
  - client validation, exact POST payload, refresh and return to page 1;
  - backend field errors beside inputs;
  - duplicate-submit prevention;
  - network and 401 during save;
  - the dashboard's Add application flow.
- `authFlow.test.jsx`:
  - protected and guest route redirects, and the not-found page;
  - session initialization through `/api/auth/me` (valid token, 401, deleted
    account, expired session, server unreachable);
  - logout;
  - automatic logout at `expiresAt`;
  - a dashboard shell with no fake data;
  - Priorities in the sidebar as a link.

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
- `test/integration/priorities.integration.test.js` scores real stored applications,
  with dates relative to today in UTC. It checks:
  - authentication;
  - ranking order and categories;
  - expired-deadline and overdue explanations;
  - rejected applications excluded by default and included on request;
  - pagination of the global ranking;
  - isolation between two users;
  - that no priority field is ever stored;
  - the time zone preference (Milestone 5C):
    - a registered account has no stored `timezone` and reports the UTC default;
    - `PATCH /api/auth/me` stores only that user's zone, and an invalid zone is
      rejected;
    - the priorities `referenceDate` matches today in Chicago;
    - the stored application record is byte-for-byte unchanged.

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
