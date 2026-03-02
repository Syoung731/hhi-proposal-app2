# Verification: Root (/) vs Admin Middleware

Use these steps to confirm the root route responds and middleware only runs where intended.

## 1. Clean and restart

- Delete the `.next` folder (e.g. `Remove-Item -Recurse -Force .next` in PowerShell).
- Start the dev server: `npm run dev`.

## 2. Root route (middleware must NOT run)

```bash
curl.exe -v --max-time 10 http://localhost:3000/
```

- **Expected:** `200 OK` and HTML for "HHI Builders Proposal App".
- **Terminal:** No `MIDDLEWARE HIT:` log for `/` (middleware is not invoked for `/`).

## 3. Admin route when signed out (middleware must run)

```bash
curl.exe -v --max-time 10 http://localhost:3000/admin
```

- **Expected:** `307` redirect to `/sign-in` (e.g. `Location: http://localhost:3000/sign-in...`).
- **Terminal:** You should see:
  - `MIDDLEWARE HIT: /admin`
  - `ADMIN ROUTE CHECK: /admin`
  - `ADMIN: NO USER — REDIRECTING TO SIGN-IN`

## 4. Summary

| Route   | Middleware runs? | Expected behavior                          |
|--------|-------------------|--------------------------------------------|
| `/`    | No                | 200 OK, static home page                   |
| `/admin` (signed out) | Yes | 307 to `/sign-in`, debug logs in terminal |

After verification, you can remove the temporary `console.log` debug lines from `middleware.ts` if desired.

---

# Verification: /p/* bypasses middleware

Confirm that `/p/*` never hits middleware and that server components still enforce 404 / 200 as intended.

## 1. /p/* does not hit middleware

- In terminal (with dev server running), visit `http://localhost:3000/p/<id>` in the browser (use a real project id).
- **Expected:** No `MIDDLEWARE HIT:` (or any middleware debug) log for that request. Only `/admin`, `/sign-in`, `/sign-up`, `/api`, `/trpc` should produce middleware logs.

## 2. /p/[id] server rules (404 when not public)

```bash
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/p/<id>
```

- Use an `<id>` for a project that is **not** published (e.g. `isPublic` is false or project does not exist).
- **Expected:** `404`.

## 3. /p/[id] when published => 200

- Publish a project (set it public), then:
```bash
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/p/<id>
```
- **Expected:** `200`.

## 4. /admin still protected

```bash
curl.exe -v --max-time 10 http://localhost:3000/admin
```

- When signed out, **expected:** `307` redirect to `/sign-in` (middleware still runs for `/admin`).

---

# Verification: Section unitQuantity computation (Room save)

Deterministic `unitQuantity` is recomputed server-side when saving a section (Room), unless `unitQuantityManualOverride` is true.

## Rules (summary)

- **effectiveMode** = `measurementMode ?? sectionType.defaultMeasurementMode ?? NONE`
- **DIMENSIONS:** length = lengthFt + (lengthIn/12), width = widthFt + (widthIn/12); if both present → unitQuantity = round(length × width, 2); else null
- **AREA:** unitQuantity = round(areaSqFt, 2)
- **COUNT:** unitQuantity = quantity (as float)
- **NONE:** unitQuantity = null
- Height is never used for area.

## 1. Unit tests (logic only)

```bash
npx tsx scripts/verify-section-unit-quantity.ts
```

- **Expected:** `Result: 13 passed, 0 failed`

## 2. Integration (manual)

1. **Create/update room (Rooms tab)**  
   - Edit a room and set length/width (e.g. 12' 0" × 10' 0"). Save.  
   - If the room has a section type with default measurement mode DIMENSIONS (or room measurement mode is DIMENSIONS), expect `unitQuantity` = 120 (or check in DB/UI if exposed).  
   - If measurement mode is NONE or section type has no default, `unitQuantity` stays null unless AREA/COUNT apply.

2. **Override**  
   - When `unitQuantityManualOverride` is true (once the UI supports it), saving the room must not overwrite `unitQuantity`.

3. **Update scopes from transcript**  
   - Run "Update scopes from transcript" for a project; rooms that get updated dimensions should have `unitQuantity` recomputed (unless override is set).
