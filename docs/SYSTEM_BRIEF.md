# telnet-setup — Component Brief

*SurveyLink platform / edge streaming node. Synthesized from the code at
`claude/zahner-system-docs-mt2d7x`.*

---

## 1. PURPOSE

This is the little program that runs on the laptop sitting next to the total
station in the field. It does two things, over and over. When somebody back in
the web app picks an anchor point and asks the instrument to go look at it, this
program hears that request, turns the telescope toward the coordinates it was
given, and waits. When the instrument reports back a measured point, this
program writes that shot up to the cloud, stamped with the anchor it belongs to
and the session (the zone or elevation) the crew is working. It is the wire
between the gun and the cloud — it holds no drawings, does no math on the
numbers, and makes no decisions about whether a point is in or out of
tolerance. It reads and it relays. If the laptop is closed or this window is
shut, the crew can still shoot manually, but nothing they shoot reaches the web
app and no directives come back.

---

## 2. BOUNDARIES

**This component owns:**

- The TCP socket to the instrument and the byte-level GeoCOM ASCII dialect
  spoken over it (`src/TelnetStreamer.js`, `src/models/Command.js:3-9`).
- Deciding whether an inbound line from the instrument is a *command
  acknowledgement* or a *measured point* — the only parsing it performs is a
  prefix test on `%R8P` (`src/TelnetStreamer.js:5,40-47`).
- Serializing commands so only one instrument operation is in flight at a time
  (`src/helpers/CommandQueue.js`).
- Creating `points` documents and flipping `commands.isInvoked` to `true`
  (`src/models/Session.js:31-42`, `src/models/Command.js:128-132`).

**This component assumes another component owns:**

| Assumed owned by | What they own |
|---|---|
| **SurveyLink web app** | Creating the `sessions` document. This node refuses to start if it does not already exist — `Sessions must be created using the web app` (`src/models/Session.js:70-74`). Also authoring `commands` documents with target coordinates, and setting `sessions.latestSelectedAnchor`. |
| **SurveyLink web app** | *Parsing* the measured point. This node stores the raw instrument line verbatim in a field literally named `string` (`src/models/Session.js:39`). Nothing here splits the comma-delimited record into N/E/Z. Model-vs-measured comparison and field directives happen entirely downstream. |
| **Firestore (`zahner-production-8e2af`)** | All persistence, all fan-out to web clients, and the realtime transport. There is no local database, no queue file, no spool. |
| **Leica MS60 total station** | Prism search, angular positioning, EDM distance, and the coordinate frame. This node sends an instruction and trusts the reply. |
| **Fabrication / model source** | The `position {x,y,z}` inside a command. This node never validates it, never transforms it between coordinate systems, and does not know what an anchor *is* beyond an opaque identifier. |
| **A removed Cloud Function** | `setLatestSelectedAnchor` used to be the HTTP writer of `sessions.latestSelectedAnchor` (`git show 3f30f44^:functions/src/index.ts`). It was deleted in `3f30f44`. This node still *reads* that field, so something else must now write it — see Open Questions. |
| **The Windows field node / operator** | Process supervision. There is no service wrapper, no restart-on-exit, no watchdog. A `.bat` file and a console window are the entire lifecycle manager. |

---

## 3. INTERFACES

### 3.1 Outbound — TCP socket to the total station

- **Direction:** this node → instrument.
- **Other end:** Leica MS60, at `ZEA_TELNET_HOST:ZEA_TELNET_PORT`
  (`192.168.76.127` in all four current `.bat` launchers; `192.168.1.5` in the
  archived ones).
- **Transport:** raw `net.Socket`, not a telnet library — no option
  negotiation, no IAC handling (`src/TelnetStreamer.js:16-27`). The
  `telnet-client` package was removed from `package.json` (commit `8b5cebb`).
- **Payload shape** — plain ASCII, CRLF-terminated (`src/models/Command.js:3-9`):

  | Sent | Wire string | When |
  |---|---|---|
  | power on | `%1POWR 1 ` (no CRLF) | immediately on socket connect (`TelnetStreamer.js:24-26`) |
  | stop stream | `%R8Q,5:\r\n` | first thing on every command |
  | start stream | `%R8Q,4:\r\n` | second thing on every command |
  | turn telescope | `%R8Q,7:1,<x>,<y>,<z>\r\n` | after the first ack |
  | search prism | `%R8Q,6:1\r\n` | **queued but never actually sent — see §6** |
  | sample distance | `%R8Q,1:\r\n` | **queued but never actually sent — see §6** |

### 3.2 Inbound — TCP socket from the total station

- **Direction:** instrument → this node.
- **Framing:** none. Each TCP chunk is `.toString('utf8').trim()`ed and treated
  as one whole message (`src/TelnetStreamer.js:36`). There is no split on
  newline and no buffering of partial lines.
- **Classification** (`src/TelnetStreamer.js:40-49`):
  - Starts with `%R8P` → emitted as `streaming-response` (an acknowledgement).
  - **Anything else** → emitted as `point`. This is an else-branch, not a
    positive match: banners, errors, noise, and partial frames all become
    "points".
- **Acknowledgement shape:** `%R8P,<...>:<code>`. The code is everything after
  the **last** colon (`src/models/Command.js:64`). Known codes
  (`src/models/Command.js:11-26`): `0` GRC_OK, `26` GRC_DIST_ERR, `31`
  GRC_REFLECTOR_NOT_FOUND, `41` GRC_POSITIONING_FAILED, `50` GRC_START_FAILED,
  `51` GRC_STREAM_ACTIVE, `53` GRC_STREAM_NOT_ACTIVE, `3107` another request
  still pending.
- **Point shape** (documented only in a code comment,
  `src/TelnetStreamer.js:44-45`, and confirmed by `assets/mock-points.txt`):

  ```
  TS0012,410.9147,512.9075,103.3155,10/07/2020,18:53:02.68,16934825
  <pointId>,<c1>,<c2>,<c3>,<MM/DD/YYYY>,<HH:MM:SS.ss>,<counter/ms>
  ```

  Real project data uses fabrication marks rather than `TS####` ids, e.g.
  `MB-PA2-10-1,8.6425,48.6605,4.5591,...`
  (`assets/ZSK_MockUpB_ScanData-simple.txt`).

### 3.3 Firestore — `sessions/{ZEA_SESSION_ID}`

- **Direction:** read + realtime subscribe. Never written by this node.
- **Startup read:** a one-shot `get()`; if the document is absent the process
  throws and dies (`src/models/Session.js:68-74`).
- **Subscription:** `onSnapshot` keeping `latestSelectedAnchor` in a private
  field (`src/models/Session.js:83-91`).
- **Other end:** the SurveyLink web app.

### 3.4 Firestore — `commands` collection

- **Direction:** realtime subscribe (read), plus a targeted update.
- **Query:** `where sessionId == <id>` AND `where isInvoked == false`,
  `orderBy createdAt` (`src/models/Session.js:50-55`). Only `change.type ===
  'added'` is acted on.
- **Write:** `commands/{id}.update({ isInvoked: true })`
  (`src/models/Command.js:129-130`) — this is the acknowledgement the web app
  watches for.
- **Requires a composite index** on `(sessionId, isInvoked, createdAt)`. No
  `firestore.indexes.json` exists in this repo, so that index lives in console
  configuration only.
- **Other end:** the SurveyLink web app writes these.

### 3.5 Firestore — `points` collection

- **Direction:** write only. Auto-generated document id
  (`src/models/Session.js:31-42`).
- **Other end:** the SurveyLink web apps read these for measured-vs-model
  comparison.

### 3.6 Environment variables

| Var | Required | Read at | Notes |
|---|---|---|---|
| `ZEA_STREAMER_TYPE` | **yes**, hard throw | `index.js:7,12-14` | `mock` selects `MockStreamer`; **any other value** selects `TelnetStreamer` — it is not validated against `telnet` |
| `ZEA_SESSION_ID` | **yes**, hard throw | `index.js:8,16-18` | the Firestore `sessions` document id |
| `ZEA_TEST_POINTS_FILE` | **yes**, hard throw | `index.js:9,20-22` | required *even in telnet mode*, where it is then unused — see Open Questions |
| `ZEA_TELNET_HOST` | effectively yes | `index.js:27` | not validated |
| `ZEA_TELNET_PORT` | effectively yes | `index.js:27` | not validated; if unset, `net` throws `ERR_MISSING_ARGS` at connect |
| `GCP_PROJECT_ID` | soft | `src/helpers/firebase.js:7` | only builds the RTDB `databaseURL`; Firestore works without it |
| `DEBUG` | optional | `debug` pkg | set to `zea:*` to see the `zea:telnet-client` channel (`src/helpers/zeaDebug.js`) |

### 3.7 Config files

- **`firebase_service_account_key.json`** — repo root. A **static ESM import
  with a JSON assertion** (`src/helpers/firebase.js:3`), so it is resolved at
  module-load time, before any code runs. Gitignored via `*key.json`. Not in
  the repo; must be placed by hand per node.
- **`.envrc.example`** — the direnv template. Note it does *not* list
  `ZEA_TELNET_PORT` as required alongside host, and its defaults point at
  `127.0.0.1:23`.
- **`.firebaserc`** — names projects `zahner-production-8e2af` (default) and
  `zahner-development`. Vestigial: the `firebase.json` it pairs with was
  deleted with the cloud functions in `3f30f44`.

### 3.8 CLI entry points

- `yarn start` → `node --experimental-json-modules index.js` (`package.json`).
- `yarn dev` / `yarn debug` → nodemon, the latter with `--inspect=0.0.0.0`
  (an unauthenticated debugger port — fine on a closed field VLAN, not
  elsewhere).
- **Per-session `.bat` launchers** in the repo root — these are the real field
  entry points. Each hardcodes one `ZEA_SESSION_ID` and one instrument IP:

  | File | Session id | Host |
  |---|---|---|
  | `360_Anchor_01.bat` | `hZP48eRxk59Aq23rNZxM` | `192.168.76.127` |
  | `360_Anchor_02.bat` | `7uigFwbdNB4yv8NBV3fd` | `192.168.76.127` |
  | `360_Mullion_00.bat` | `v8JxQSif9fWgVVdEcjOx` | `192.168.76.127` |
  | `360_Mullion_02.bat` | `ssv2CvAkVgRwkvSy9su2` | `192.168.76.127` |

  `Archive_Bat/` holds ten superseded launchers from earlier jobs (MUB, MUC,
  sector zones 1–6), with human-readable session ids like `sector-zone-4_Shift`
  rather than Firestore auto-ids.

### 3.9 Dead / vestigial interface: `client/build`

A compiled create-react-app bundle is checked in (`client/build/`). Its
sourcemap shows a 5-component MUI launcher (`App.js`, `DropDownList.js`,
`DropDownListSession.js`, `Button.js`, `Output.js`) that `POST`s
`{title, IPAddress, sessionID}` to **`/api/button`**. **No server in this repo
serves that route or those files** — there is no Express dependency and no
`listen()` call anywhere. It is an abandoned "pick an IP, pick a session, press
Start" GUI intended to replace the `.bat` files. Its hardcoded dropdowns
(`192.168.1.0`–`192.168.1.5`; sessions `PMU`/`PMU2`) do not match any current
project.

---

## 4. DATA MODEL

### `sessions/{sessionId}`

| Field | Type | Notes |
|---|---|---|
| *(doc id)* | string | = `ZEA_SESSION_ID`. Historically a slug (`sector-zone-4_Shift`), now a Firestore auto-id. |
| `latestSelectedAnchor` | string \| null | The only field this node reads (`src/models/Session.js:85-86`). Whatever else the document holds is invisible here. |

### `commands/{commandId}`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Must equal the doc id — the update path is built from `data.id`, not from the snapshot ref (`src/models/Command.js:129`). If the writer omits or mismatches it, the ack write targets the wrong document. |
| `sessionId` | string | Query filter. |
| `isInvoked` | boolean | Must be written as literal `false`; a missing field excludes the doc from the query entirely. |
| `createdAt` | timestamp | Order key. |
| `position` | `{x, y, z}` | Model-space target for the telescope. |
| `anchor` | string | Carried straight through onto the resulting point. |

### `points/{pointId}`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Mirrors the doc id. |
| `createdAt` | server timestamp | Written by Firestore, not by the instrument clock. **The instrument's own date/time inside the raw record is a different, unreconciled clock.** |
| `sessionId` | string | |
| `anchor` | string | Either the command's anchor, or the session's `latestSelectedAnchor` fallback. |
| `string` | string | The **entire raw instrument line**, unparsed. |

### In-memory only

- `CommandQueue.queue` — array of pending `Command` objects.
- `CommandQueue.isInProgress` — boolean latch.
- `Session.#latestSelectedAnchor` — private mirror of the session field.

### Same concept, different names

| Concept | Names in the code |
|---|---|
| The measured record | `point` (event, params), `data` (MockStreamer's emit), `string` (the Firestore field, `Session.js:39`), `decoded` (`TelnetStreamer.js:36`) |
| The anchor being shot | `anchor` (command + point field), `latestSelectedAnchor` (session field), `#latestSelectedAnchor` (private), `theAnchor` (local, `Session.js:28`) |
| A new measurement arriving | `'point'` event (TelnetStreamer) vs **`'data'` event (MockStreamer, `MockStreamer.js:32`)** — these do not match; see §6 |
| "Busy" | `isInvoked` (durable, per-command, in Firestore) vs `isInProgress` (transient, per-process, the queue latch) — adjacent-sounding, unrelated lifetimes |
| Mock source file | `ZEA_TEST_POINTS_FILE` (env), `mockPointsPath` (ctor), `assets/mock-points.txt` (the sample) |
| Coordinate triple | `position {x,y,z}` on a command (model space) vs fields 2–4 of the raw point (instrument space) — never reconciled here |

---

## 5. RUNTIME

**Start sequence.** Operator double-clicks a `.bat`, which `cd`s to the repo,
sets three env vars, and calls `yarn start`. Node loads `index.js`, which
transitively imports `src/helpers/firebase.js` — and that module *initializes
the Firebase app and reads the service-account JSON as a side effect of being
imported*. So credential failure happens before the first line of `index.js`
executes.

**Must already be running / already exist:**

1. The total station, powered, on the network, with its streaming/automation
   app open and **no modal notification on its screen** — this constraint is
   recorded only as a comment (`src/models/Command.js:110-111`).
2. The `sessions/{ZEA_SESSION_ID}` document, created by the web app.
3. Network route to Firestore, and the composite index on `commands`.
4. `firebase_service_account_key.json` present on disk.

**On connect** (`StreamerDbBridge.start()`):

1. `streamer.connect()` — opens the socket and writes `%1POWR 1 `.
2. `session.init()` — verifies the session doc exists, then subscribes to it.
3. Subscribes to unfired commands; each becomes a `Command` pushed onto the
   `CommandQueue`.
4. Registers a **one-shot** listener for the very first `point`
   (`StreamerDbBridge.js:21`) so a manually-triggered shot before any command
   still gets recorded — attributed to `latestSelectedAnchor`.

**Per command** (`Command.invoke()`): send `STOP_STREAM`, send `START_STREAM`,
wait for one acknowledgement, then send `turnTelescope`. The returned Promise
resolves only when a `point` event arrives; the queue will not advance until it
does.

**Retry / reconnect behavior: there is essentially none.**

- Socket `error` is logged to stderr and nothing else (`TelnetStreamer.js:20`).
  There is no handler for `close`, `end`, or `timeout`, and no reconnect
  attempt, backoff, or keepalive anywhere in the codebase.
- The one retry-shaped thing — the `3107` "another request still pending"
  branch — is `setTimeout(() => console.log(...), 500)`
  (`src/models/Command.js:76-78`). It schedules a **log line**, not a resend.
  Nothing is retried.
- Firestore's own SDK reconnects its listeners transparently; that is the only
  self-healing in the system, and it covers the cloud side only.

**Where state lives.** Durably: Firestore, exclusively. In-process: the command
queue, the queue latch, and the cached anchor — **all lost on restart**. A
command already marked `isInvoked: true` but whose point never landed will
never be retried, because the query filters on `isInvoked == false`.

---

## 6. FAILURE MODES

Ordered roughly by how often a crew would meet them.

| # | Trigger | Mechanism | What the crew sees |
|---|---|---|---|
| 1 | **`SEARCH` and `SAMPLE_DIST` are never sent** | `once('streaming-response')` (`Command.js:62`) consumes the listener on the first ack. Only `localQueue.shift()` #1 (`turnTelescope`) is ever sent; `SEARCH` and `SAMPLE_DIST` stay in the array forever. Verified by direct reproduction. | Telescope swings to the anchor and then just sits there. No prism hunt, no distance shot. Crew concludes "it pointed but didn't measure" and shoots manually. |
| 2 | **Code `3107` wedges the queue permanently** | The `3107` branch sends nothing, and the `once` listener is already spent. The Promise never resolves, so `CommandQueue.isInProgress` stays `true` forever (`CommandQueue.js:20-28`). | First anchor works, every subsequent one is dead. Buttons in the web app do nothing; commands pile up with `isInvoked: false`. Only fix is closing the console window and re-launching the `.bat`. |
| 3 | **Prism not found (`31`)** | Marks the command invoked and returns without resolving (`Command.js:81-87`). Same latch wedge as #2, but the web app *thinks* the command succeeded. | Web app shows the directive as done; no point ever appears. Queue is dead for the rest of the session. |
| 4 | **Positioning failed (`41`)** | Logged and returned; Promise never resolves (`Command.js:103-107`). | Instrument may have moved but no measurement lands. Queue wedged. |
| 5 | **Stale anchor mis-attribution** | `#latestSelectedAnchor` is a cached mirror; a point arriving via the fallback path is stamped with whatever anchor was last selected. Flagged in-code: *"Isues: this.#latestSelectedAnchor is holding onto previouw anchor"* (`Session.js:28`). | A shot shows up in the web app attached to the *wrong* anchor. Comparison shows a large bogus deviation. Very hard to spot in the field. |
| 6 | **Duplicate points** | Every stalled command leaves its `once('point')` listener registered. The next real point fires *all* of them, each calling `addPoint` (`Command.js:118-124`). The dead code at `Command.js:39-43` documents exactly this: *"without this points and anchors are added multiple times"*. | One shot produces two or more points in the web app, some carrying older anchors. After ~11 stalls, Node also prints a `MaxListenersExceededWarning`. |
| 7 | **Bridge's manual-shot capture silently disables itself** | `StreamerDbBridge.js:21` is `once`, but the guard `if (isInProgress) return` (line 22) runs *after* the listener has already been consumed. | If the first point of the run happens to arrive during a command, manual shots are never recorded again for that process lifetime, with no message. |
| 8 | **No frame reassembly** | A TCP chunk is trimmed and used whole (`TelnetStreamer.js:36`). Two records in one chunk become one malformed "point"; a split record becomes two. | Garbled or truncated coordinate strings land in `points.string` and fail downstream parsing. Appears as a point that "didn't come through right". |
| 9 | **Any non-`%R8P` line becomes a point** | The classification is an else-branch (`TelnetStreamer.js:47`). | Instrument banners or error text are written to Firestore as measurements. Junk rows appear in the point list. |
| 10 | **Missing session document** | Hard throw with a clear message (`Session.js:70-74`). | Console window flashes `Session not found. Id: "…". Sessions must be created using the web app.` and closes to the `pause` prompt. This one is actually diagnosable. |
| 11 | **Missing env var** | Hard throw at `index.js:12-22`. | `Missing "ZEA_TEST_POINTS_FILE" env var.` — confusing, because the `.bat` files never set it and the crew is in telnet mode. |
| 12 | **Missing / bad service-account key** | Module-load failure in `firebase.js:3`. | An ESM module-resolution stack trace before any friendly logging. Reads as "the program is broken", not "the key file is missing". |
| 13 | **`ZEA_TELNET_PORT` unset** | `net` throws `ERR_MISSING_ARGS` (verified). None of the four current `.bat` files set it. | Immediate crash on start unless the port is set machine-wide in Windows. |
| 14 | **Instrument unreachable / cable pulled / gun sleeps** | `error` is logged; no `close` handler, no reconnect. | Console shows one `Socket error:` line, then the window sits there looking alive and healthy forever while nothing works. **This is the worst symptom in the list: silent, indistinguishable from idle.** |
| 15 | **Firestore offline** | SDK buffers and retries internally. | Points appear to be captured locally but the web app lags or shows nothing until connectivity returns. |
| 16 | **Mock mode produces no points at all** | `MockStreamer` emits `'data'` (`MockStreamer.js:32`); nothing anywhere listens for `'data'`. | Mock runs look healthy and write nothing. Affects office testing, not field crews. |

---

## 7. CONFIGURATION

**Per node (the field laptop), set once:**

- `firebase_service_account_key.json` in the repo root — obtained from Firebase
  console → project settings → service accounts.
- `GCP_PROJECT_ID` — `zahner-production-8e2af` per `.firebaserc`.
- Repo checked out at `%UserProfile%\Documents\GitHub\telnet-setup` — the
  `.bat` files hardcode this path.
- Node.js ≥ 16 and yarn.
- `ZEA_TELNET_PORT` — **not set by any current launcher**; must be set in the
  Windows environment or the launchers must be edited.

**Per station / instrument:**

- `ZEA_TELNET_HOST` — the instrument's IP. Currently `192.168.76.127`
  everywhere; the archived launchers used `192.168.1.5`, implying the field
  subnet has changed at least once and the archive is stale.
- `ZEA_TELNET_PORT` — README says `23`; note GeoCOM over TCP commonly uses
  `1212`, so this is worth confirming against a live gun.

**Per project / per session (the thing that changes most):**

- `ZEA_SESSION_ID` — one Firestore session doc per zone/elevation. **The
  current workflow is: copy a `.bat`, paste in a new auto-generated session id,
  commit it.** That is why the repo root accumulates
  `360_Anchor_01`/`360_Mullion_02`-style files and why `Archive_Bat/` exists.
  Session ids are opaque 20-character Firestore ids, so the filename is the
  *only* human-readable link between a launcher and a physical zone.

**Optional:**

- `ZEA_STREAMER_TYPE` — `mock` or anything else (anything else = telnet).
- `ZEA_TEST_POINTS_FILE` — a points text file; `assets/mock-points.txt` (9
  synthetic rows) or `assets/ZSK_MockUpB_ScanData-simple.txt` (12 rows of real
  MockUp-B fabrication marks, with blank lines).
- `DEBUG=zea:*`.

---

## 8. DEPENDENCIES & VERSIONS

| Item | Version | Fragility |
|---|---|---|
| Node.js | `>=16` (`package.json` engines) | **Load-bearing and fragile.** The code relies on ESM top-level `await` (`index.js:33`), class private fields and private methods (`#handleData`, `#observeSession`), and **JSON import assertions** using the old `assert { type: 'json' }` syntax (`firebase.js:3`) behind `--experimental-json-modules`. That syntax was replaced by `with { type: 'json' }` and the `assert` form is **removed in Node 22+**. This will not start on a current Node LTS without an edit. |
| `firebase-admin` | `^9.11.1` | Two major versions behind (v9 dates to 2021). `^` allows drift within v9 only. |
| `rxjs` | `^7.3.0` | Used for exactly one thing: `interval(1000)` in `MockStreamer`. Trivially removable. |
| `debug` | `^4.3.2` | **Declared as a devDependency but imported by production code** (`src/helpers/zeaDebug.js`). A `yarn install --production` deploy crashes on startup. |
| `nodemon`, `prettier` | `^2.0.12`, `^2.4.1` | dev only. |
| `net` (Node builtin) | — | Replaced the `telnet-client` package (removed in `8b5cebb`). |
| `yarn.lock` | present but **gitignored** | Listed in `.gitignore` yet committed. Installs are therefore not reproducible in intent, only by accident. |
| Removed | `telnet-client`, `express`, `cors`, `firebase-functions` | All gone from the runtime; only historical. |

Also note the **`Dockerfile` cannot build**: `FROM ubuntu` with no Node or yarn
installed, then `RUN yarn install`. It installs `telnet`, `xinetd`, `telnetd`
and exposes port 23 — i.e. it was written to stand up a *fake total station* to
connect to, not to containerize this client. It is misleading as-is.

---

## 9. OPEN QUESTIONS

1. **Who writes `sessions.latestSelectedAnchor` now?** The `setLatestSelectedAnchor`
   Cloud Function that owned that write was deleted in `3f30f44`. This node
   still reads the field and falls back to it for un-commanded points. If
   nothing writes it, the fallback path is permanently `null` and the warning
   at `Session.js:21-23` fires on every manual shot.

2. **Is `SEARCH`/`SAMPLE_DIST` never firing a known regression or the intended
   behavior?** Commit `2f2847b`/`4288e06` changed `on` → `once` in three places
   with the inline note `//on ->once` and `//once event vs on event`. The change
   fixed duplicate points (#6) by breaking the command sequence (#1). Someone
   traded one bug for another and the code still carries both commented-out
   alternatives (`Command.js:42-43,61`). **This is the single most important
   thing to resolve** — it determines whether the instrument is actually
   measuring on command in the field today, or whether crews have quietly
   fallen back to manual shooting.

3. **Why is `ZEA_TEST_POINTS_FILE` mandatory in telnet mode?** Added in the most
   recent commit (`d871606`, "feat: add env var detection"). None of the four
   current `.bat` launchers set it. Taken literally, **every committed launcher
   crashes on startup**. Either the field machines have it set globally, or the
   `.bat` files in this repo are not the ones actually in use — which would mean
   the real per-session configuration is undocumented and lives only on the
   laptops.

4. **The four root `.bat` files have a broken `cd`.** They use
   `cd "C:\Users\%UserProfile%\Documents\..."`, but `%UserProfile%` already
   expands to `C:\Users\<name>`, producing `C:\Users\C:\Users\<name>\...`.
   `cd` fails, prints an error, and execution continues in whatever directory
   the file was launched from — so it works *by accident* when double-clicked
   from inside the repo folder. Exactly one archived file,
   `Archive_Bat/Z_Telnet-MK2_Zone-3_IP_Shift.bat`, has it right.

5. **The `client/build` React launcher is orphaned.** It posts to `/api/button`
   with an IP and session id — the obvious successor to the `.bat` sprawl — but
   no server in this repo serves it. Was the server ever written? Its hardcoded
   IP and session lists match no current project.

6. **`%1POWR 1 ` is undocumented and unlike everything else.** Every other
   command uses the `%R8Q` GeoCOM form with CRLF; this one uses a different
   prefix and no line terminator (`TelnetStreamer.js:25`). No response is
   checked. What is it, and does it still apply to the MS60?

7. **The `TotalStationResponses` map is decorative.** It is consulted only for
   log strings, and codes `26`, `50`, `51`, `53` are never branched on. `40`
   and `30` are commented out. `GRC_STREAM_ACTIVE (51)` in particular seems
   like it should be handled given every command blindly sends `STOP_STREAM`
   then `START_STREAM`.

8. **`Command.js:37` comment contradicts the code.** The comment says
   *"switched x and y to match the total station"* on the destructuring line,
   but the swap actually happens at the call: `turnTelescope(y, x, z)` against
   a `(x, y, z)` signature (`Command.js:5,54`). Anyone reading only the
   comment, or only the signature, will get the axis convention wrong. Whether
   the instrument frame is genuinely Y-X-Z or whether this compensates for a
   bug elsewhere is not documented anywhere.

9. **The unreachable `31` branch.** `Command.js:96-102` can never execute — the
   `31` case already returned at line 81-87. Note the two branches do *different*
   things (the first marks the command invoked, the second doesn't), so this is
   a half-finished edit, not harmless duplication.

10. **Nothing validates `position`.** If a command arrives with a missing
    `position`, `Command.js:37` throws inside the queue's `.then()` chain as an
    unhandled rejection, and `isInProgress` is never cleared — another
    permanent wedge.

11. **Contradiction with the platform description.** The brief describes this
    node as streaming GeoCOM data to Firestore for realtime comparison. In
    practice the node writes an **unparsed string** and does no streaming in the
    continuous sense — it captures a single point per command and then blocks.
    The `START_STREAM`/`STOP_STREAM` commands exist but no continuous stream is
    ever consumed. If the platform expects a point *rate*, that expectation is
    not met by this code.

12. **No tests, no CI, no linter config for the runtime code**, and no
    `firestore.rules` / `firestore.indexes.json` — the composite index the
    `commands` query requires is undeclared anywhere in version control.

---

## MACHINE BLOCK

```
BLOCK: Telnet Field Node
TAG: Edge / Streaming
SUBTITLE: The laptop beside the total station that relays shots up and commands down.
SUBS:
- Instrument Link :: Holds an open network connection to the Leica total station and speaks its command language. It powers the instrument's remote mode on connect and writes plain text instructions down the wire. Everything the station says comes back through this same connection.
- Message Sorter :: Reads each line the instrument sends and decides what it is. Lines beginning with a specific marker are treated as replies to a command; everything else is treated as a measured point. It does no interpretation beyond that sorting step.
- Command Queue :: Watches the cloud for new field directives and runs them strictly one at a time. A new directive waits until the one ahead of it finishes. If a directive never completes, the line behind it stops moving until the program is restarted.
- Telescope Driver :: Takes the target coordinates from a directive and tells the instrument to swing the telescope there. It stops and restarts the instrument's stream first, then issues the move. It then waits for a measurement to come back.
- Point Publisher :: Writes each measured shot to the cloud exactly as the instrument phrased it, tagged with the job session and the anchor it belongs to. It adds a cloud timestamp. It does not check the numbers or convert them.
- Session Binder :: Ties this laptop to one specific job zone at startup and refuses to run if that zone was not already set up in the web app. It also tracks which anchor the crew has selected, so manually-taken shots can still be filed correctly.
EDGES:
- Telnet Field Node -> Leica MS60 Total Station :: telescope-turn, search and distance commands as GeoCOM ASCII over TCP :: primary
- Leica MS60 Total Station -> Telnet Field Node :: measured point records and command acknowledgement codes :: feedback
- Telnet Field Node -> Firestore :: new point documents; command marked as invoked :: primary
- Firestore -> Telnet Field Node :: new field directives with target coordinates and anchor; currently-selected anchor :: primary
- SurveyLink Web App -> Firestore :: session setup, field directives, anchor selection :: primary
- Firestore -> SurveyLink Web App :: measured points for measured-vs-model comparison :: feedback
- Field Operator -> Telnet Field Node :: launches one per-session batch file, one per zone :: primary
```
