# Zillow Import – Chrome Extension

Chrome extension (Manifest V3) that pairs with the proposal app and detects listing photos on Zillow property pages. **Photo upload to the app is not implemented yet.**

## Load the extension (unpacked)

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (toggle in the top-right).
3. Click **Load unpacked**.
4. Select the folder: `chrome-extension/zillow-importer` (this folder).
5. The extension **Zillow Import** should appear in your extensions list. Pin it to the toolbar if you like.

## How to pair with the app

1. **Start the proposal app** (e.g. `npm run dev` so the app runs at `http://localhost:3000`).

2. **Get a pair code from the app:**
   - Open a project in the app.
   - Go to the **Media** tab.
   - Select any **section** (not Front Page).
   - Click **Import from Zillow**.
   - In the modal, click **Generate Code**.
   - Copy the 8-character code (e.g. `ABC12XYZ`).

3. **Pair in the extension:**
   - Click the extension icon in the Chrome toolbar to open the popup.
   - **App URL** should default to `http://localhost:3000` (change it if your app runs elsewhere).
   - Paste the pair code into **Pair Code**.
   - Click **Pair**.
   - The status should show **Paired to project: &lt;projectId&gt;**.
   - Pairing is stored in the extension until you click **Clear Pairing**.

4. **Clear pairing:** Click **Clear Pairing** in the popup to remove the stored project and return to “Not paired.”

## Listing photos (Phase 3)

- Open a **Zillow property listing page** (e.g. a specific home for sale).
- Click the extension icon to open the popup.
- The **Listing Photos** section shows a grid of images extracted from that page (large gallery images only; small thumbnails are filtered out).
- Click a photo to select or deselect it (checkbox overlay). Selection state is for future upload; upload is not implemented yet.
- If you see "No listing photos detected", ensure the active tab is a Zillow property page and reopen the popup.

## Direct handshake (no code)

When the app’s Import from Zillow modal is open and has started a connection session, the extension can pair without a code:

1. Open the app’s Media tab and click **Import from Zillow** (modal opens and shows “Connecting your browser…”).
2. Open the extension popup and click **Pair** with the Pair Code field empty. If the extension sees a pending nonce from the app page, it will verify directly and show **Paired to project: &lt;projectId&gt;**.
3. If direct handshake is not available (e.g. app tab not open or session expired), enter a pair code and click **Pair** as above (manual fallback).

## Web app ↔ extension messaging API

The extension supports a structured messaging layer so the web app can detect the extension and perform a direct handshake without the user opening the popup.

### Two ways the app can talk to the extension

1. **postMessage bridge (no extension ID needed)**  
   On app origins where the extension’s content script runs (e.g. `http://localhost:3000`), the page can send messages via `window.postMessage`. The content script forwards to the extension and posts the response back. This works for unpacked and packed extensions.

2. **externally_connectable (extension ID required)**  
   If the app knows the extension’s ID (e.g. after publishing to the Chrome Web Store), it can call `chrome.runtime.sendMessage(extensionId, message, callback)` from an approved origin. Only origins listed in the manifest’s `externally_connectable.matches` are allowed.

### Message contract (see also `messages.js`)

- **ping**  
  Request: `{ type: "ping" }`  
  Response: `{ installed: true, extensionVersion, supportedHandshakeVersion, scraperReady: true }`

- **getCapabilities**  
  Request: `{ type: "getCapabilities" }`  
  Response: `{ directHandshakeSupported: true, manualPairingSupported: true, supportedOrigins: string[], extensionVersion }`

- **beginHandshake**  
  Request: `{ type: "beginHandshake", nonce, sessionId, origin [, metadata] }`  
  Response (success): `{ success: true, projectId }`  
  Response (error): `{ success: false, error: string, code }`  
  Error codes: `unsupported_origin` | `bad_payload` | `duplicate_handshake` | `expired_nonce` | `verify_failed` | `already_paired`

### Using the postMessage bridge from the app page

Send a request:

```js
var requestId = crypto.randomUUID && crypto.randomUUID() || Math.random().toString(36).slice(2);
window.postMessage({
  type: "ZILLOW_EXTENSION_REQUEST",
  requestId: requestId,
  method: "ping",  // or "getCapabilities" or "beginHandshake"
  params: {}       // for beginHandshake: { nonce, sessionId, origin, metadata? }
}, "*");
```

Listen for the response:

```js
window.addEventListener("message", function (e) {
  if (e.source !== window || !e.data || e.data.type !== "ZILLOW_EXTENSION_RESPONSE") return;
  if (e.data.requestId !== requestId) return;
  var result = e.data.result;  // or e.data.error / e.data.message on failure
});
```

### Production origins

To support a production app domain:

1. In **config.js**, add the origin to `ALLOWED_ORIGINS` (e.g. `"https://app.yourdomain.com"`).
2. In **manifest.json**, add the same origin to `externally_connectable.matches` (e.g. `"https://app.yourdomain.com/*"`) and to `host_permissions` (e.g. `"https://app.yourdomain.com/*"`).
3. In **manifest.json**, add the same pattern to the app-page content script’s `matches` so the bridge and hidden-div reader run on the production app.

## Debug logging

In the extension popup, check **Debug logging** to enable console logs in the background script and app-page content script. Logs appear in the extension’s service worker console (chrome://extensions → Zillow Import → “Inspect views: service worker”) and in the app tab’s console when the content script logs.

## Notes

- **Photo upload from the extension is not implemented yet.**
- The pair code expires in 15 minutes and can only be used once. Generate a new code from the Media tab if needed.
- The extension stores the app base URL and paired project ID in `chrome.storage.local` for use in a future phase.
- Scraping/import behavior (Zillow gallery capture, photo picker, redeem-pair-code, import-zillow-photos) is unchanged.
