# Google Workspace — Domain-Wide Delegation (Outbound Email)

Retrospective setup guide for the outbound email pipeline, originally configured on 2026-04-20. The app sends proposal emails on behalf of individual Workspace users through a single service account; this document describes how the integration is wired together and how to reproduce, troubleshoot, or rotate it.

## Overview

Domain-Wide Delegation (DWD) is the mechanism that lets a server-side service account impersonate any user inside a Google Workspace tenant, without any per-user OAuth consent screen. At send time the application mints a short-lived JSON Web Token asserting "I am service account X and I would like to act as user Y," signs it with the service account's private key, exchanges it for an OAuth access token, and hands that token to the Gmail API when calling `users.messages.send`. Gmail trusts the token because the Workspace admin has pre-authorized that specific service account's 21-digit Client ID to act on behalf of users in the tenant under a specific OAuth scope.

For HHI Builders this matters because proposal emails need to appear to come from the actual project lead (e.g. `syoung@hhi-builders.com`), not from a shared `noreply@…` mailbox. With DWD the app holds one key, authorizes it once at the tenant level, and can then send as any employee — the envelope From, the Reply-To, and the "on behalf of" header all resolve to the impersonated user rather than the service account.

The architecture lives in `app/lib/email/`. `providers/google-workspace-dwd.ts` wraps the `google-auth-library` JWT client and `@googleapis/gmail` send call behind the `EmailProvider` interface defined in `provider.ts`. `index.ts` exposes `getEmailProvider()`, which reads the active `Integration` row, decrypts the service-account JSON, and instantiates the provider; it also exposes `sendProposalEmail()`, a thin wrapper that handles per-employee daily rate limiting and writes an `EmailSendLog` row on every send (success or failure) for auditability. The admin surface that configures the integration lives at `app/admin/settings/integrations/google-workspace/` and is also surfaced inline inside `/admin/settings/integrations`.

## Required setup — Google Cloud Console

The service account lives on the GCP side of the equation. For HHI we reused an existing project named `initial-proposal`, but any GCP project in the same organization as the Workspace tenant will work.

1. **Create or reuse a Google Cloud project.** Visit [console.cloud.google.com](https://console.cloud.google.com), pick or create a project. The project does not need to be billing-enabled for Gmail API sends, but it does need to be linked to the same organization as the Workspace tenant.
2. **Enable the Gmail API.** Navigate to *APIs & Services → Library*, search for `Gmail API`, open the result, click *Enable*. This has to be done once per project.
3. **Create the service account.** Go to *IAM & Admin → Service Accounts → Create service account*. Give it a descriptive name — HHI uses `hhi-proposal-sender` which becomes `hhi-proposal-sender@initial-proposal.iam.gserviceaccount.com`. Leave roles empty; DWD does not require any IAM role on the project, only the tenant-side authorization in the next section. No users need access either.
4. **Enable Domain-Wide Delegation on the service account.** Open the service account detail page, check *Show Domain-Wide Delegation*, enable it, save. A Client ID (a 21-digit numeric string) appears — copy it; you will paste it into the Workspace admin console in the next section.
5. **Download a JSON key.** From the service account's *Keys* tab, *Add Key → Create new key → JSON → Create*. A JSON file will download. **Store it outside the repository** — HHI keeps it at `C:\Users\syoun\Documents\hhi-credentials\hhi-workspace-service-account.json`. Do not check it in, do not paste it into chat systems, do not email it. The app encrypts it at rest when you paste its contents into the admin UI, but before that happens the plaintext exists only on your machine.

## Required setup — Google Workspace admin

The Workspace side is what actually authorizes the service account to impersonate users. Without this step the JWT exchange will fail with `unauthorized_client`.

1. **Open the admin console.** Visit [admin.google.com](https://admin.google.com) as a Workspace super admin.
2. **Navigate to DWD settings.** *Security → Access and data control → API controls → Manage Domain-wide Delegation*. The phrasing changes occasionally across console redesigns, but DWD always lives under API controls.
3. **Authorize the Client ID.** Click *Add new*, paste the 21-digit Client ID from the service account, and enter the OAuth scope **exactly** as:
   ```
   https://www.googleapis.com/auth/gmail.send
   ```
   Spelling matters — `gmail.send` is the send-only scope. Broader scopes like `https://mail.google.com/` would work but are over-permissioned; our provider code only calls `users.messages.send`, so the send-only scope is correct. Save.
4. **Wait for propagation.** DWD changes typically propagate in 2–5 minutes, occasionally up to 10. If Test Send fails immediately with `unauthorized_client` or `dwd_not_ready`, the most common cause is simple impatience — wait a few minutes and retry before investigating anything else.

The HHI Workspace tenant covers three domains (`nationalbrandingsolutions.com`, `hhi-builders.com`, `hhi-vacations.com`). DWD authorization is tenant-level, so a single authorization covers impersonation across all three. The app's per-send domain guard (the *Authorized Domain* field, see next section) limits which domain the app is willing to send from regardless of what DWD would technically allow.

## App configuration

With the JSON key in hand and DWD authorized, the remaining configuration happens inside the app.

1. **Navigate to the settings page.** Either `/admin/settings/integrations/google-workspace/` for the focused view, or `/admin/settings/integrations` and scroll to the *Google Workspace (Outbound Email)* section — both surfaces render the same form.
2. **Paste the service account JSON.** Open the downloaded `hhi-workspace-service-account.json` file in a text editor, select all, paste into the *Service account JSON* textarea. The app validates the shape (`type` must be `service_account`, `client_email` and `private_key` must be present) before it encrypts and stores the value.
3. **Set the authorized domain.** For HHI this is `hhi-builders.com`. The domain is not a GCP or Workspace field — it is an application-level guard: sends whose `from` address does not end with `@<authorized-domain>` are rejected before the Gmail API is ever called. Catches typos, mis-routed employee entries, and prevents accidental sends from adjacent domains.
4. **Set the default sender email.** This must be a real Workspace mailbox inside the authorized domain — e.g. `syoung@hhi-builders.com` for HHI's initial setup. The app uses it as the impersonation subject for Test Send and as a fallback when the caller omits a `from` (rare — `sendProposalEmail` normally passes the employee's own address).
5. **Click Save Configuration.** The integration row is written with `isActive: false` regardless of save outcome. The only path to `isActive: true` is a successful Test Send. This is deliberate: a bad key should never leave the integration in a "configured and trusted by runtime code" state.
6. **Enter a test recipient and click Test Send.** The test recipient can be any address (your own inbox is the obvious default). On success, the status banner flips to *Active* with a last-verified timestamp, the `Integration` row's `isActive` flips to `true`, and the test email arrives in the recipient's inbox. On failure, the banner shows the error details and an error code (see troubleshooting below).

## Troubleshooting

The provider classifies known Gmail API errors into a small set of error codes, surfaced in the UI. Match the code you see to the row below.

| errorCode | Meaning | Fix |
|---|---|---|
| `unauthorized_client` | The 21-digit Client ID has not been authorized in Workspace admin for the requested scope, or the DWD change has not propagated yet. | Re-check the Client ID under *admin.google.com → Security → API controls → Domain-wide Delegation*. Confirm the scope is exactly `https://www.googleapis.com/auth/gmail.send`. If both look right, wait 5 minutes for propagation and retry. |
| `invalid_grant` | The impersonated subject (*Default Sender Email*) is not a real mailbox in the tenant, or the server's clock is off. | Confirm the mailbox exists in Workspace and is not suspended. If that's fine, check your machine's system clock — Google rejects JWTs whose `iat`/`exp` are more than a minute out. |
| `insufficient_scope` | The scope granted in Workspace admin does not match or is narrower than what the app requests. | Open DWD admin, confirm the scope string has no trailing whitespace, no typos, and is exactly `https://www.googleapis.com/auth/gmail.send`. Removing and re-adding the authorization resolves most cases. |
| `access_denied` | DWD is authorized, but the specific subject user is outside the impersonation policy — typically because the subject lives in a domain the app's Workspace doesn't cover. | Confirm the sender email belongs to this Workspace tenant. For HHI, only addresses in `nationalbrandingsolutions.com`, `hhi-builders.com`, or `hhi-vacations.com` are impersonable. |
| `dwd_not_ready` | Catch-all for preconditions Google reports when DWD is enabled but not yet effective. | Most often a propagation-delay artifact. Wait 5–10 minutes. If it persists, verify DWD is toggled on in the service account detail page AND authorized in Workspace admin — both are required. |
| `quota_or_precondition` | A send-side quota has been hit or the user's mailbox has a precondition preventing sends. | Check the user's mailbox status in Workspace; check the project's Gmail API quota in GCP. Unlikely in normal use. |
| `unknown` | The error didn't match any of the above patterns. | Read the `details` line in the UI for the raw message; search the Gmail API docs for the text. |

Beyond these, two non-error-code deliverability issues are worth noting. First, messages from a brand-new DWD setup can occasionally land in the recipient's *Spam* folder until the sending domain's reputation is established — our initial test send to `syoung@hhi-builders.com` landed in the inbox, but a send to a Gmail consumer account for the first time can go to spam. If this becomes a pattern for specific recipients, ensure SPF/DKIM/DMARC records are properly configured on the sending domain (they already are for `hhi-builders.com`). Second, `on behalf of` headers can appear in some clients if the envelope From and the authenticated sender disagree; our MIME builder sets `From` to the impersonated subject, which matches the JWT subject, which keeps clients from inserting the header.

## Security notes

The service account JSON is a credential as sensitive as any password — it is the private key that signs impersonation JWTs. Several layers protect it.

At rest, the JSON is encrypted using AES-256-GCM via the `encryptSecret()` helper in `app/lib/integration-secrets.ts`, keyed by the `INTEGRATION_ENCRYPTION_KEY` environment variable (32 bytes, hex or base64). The ciphertext is stored on `Integration.encryptedSecret`; the plaintext never touches the database.

In transit through the application, the plaintext is decrypted only at the last moment inside `getEmailProvider()` and passed directly into the `GoogleWorkspaceDWDProvider` constructor. Inline code comments at every decrypt call site reinforce: "NEVER log this value." The provider never re-emits the decrypted JSON; server actions that read `Integration` rows for display deliberately exclude `encryptedSecret` from their selects so the plaintext cannot accidentally reach a client component.

In the UI, the JSON textarea is write-only. After a successful save the textarea is cleared on the client so a subsequent save can't accidentally re-submit stale pasted content. The form does not re-display the saved value.

In error messages, access tokens (`ya29.*`) and PEM private keys are regex-redacted by the provider's `redactTokens()` helper before error details leave the server. An upstream Gmail failure whose raw body contains the bearer token reaches the UI with `[redacted-access-token]` in its place.

At the integration-state level, `Integration.isActive` is set to `true` only after a live Test Send succeeds. Re-saving the JSON forces `isActive: false` until the next verify passes. Runtime callers (`getEmailProvider()`) filter on `isActive: true`, so a broken or unverified configuration cannot silently become the active provider.

## Key rotation

Google recommends rotating service account keys periodically. The rotation procedure is non-disruptive:

1. **Generate a new JSON key in GCP.** *Service Accounts → hhi-proposal-sender → Keys → Add Key → JSON*. Keep the old key enabled — both coexist briefly.
2. **Paste the new JSON into the app.** Admin UI → *Service account JSON* → paste → *Save Configuration*. This flips the row to `isActive: false` automatically.
3. **Run Test Send.** Confirm the new key works end-to-end. On success the row flips back to `isActive: true`.
4. **Disable or delete the old key in GCP.** *Service Accounts → hhi-proposal-sender → Keys*, delete the old key row. Until this step the old key would still be valid; that's intentional so you have a window to roll back if the new key has a problem.

The whole rotation takes about five minutes and does not require any Workspace-side change — DWD authorization is against the 21-digit Client ID of the service account, not against any specific key. The Client ID is stable across rotations.
