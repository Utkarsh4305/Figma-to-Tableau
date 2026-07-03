# Figma to Tableau — Payment server (Razorpay)

Billing backend for the plugin's Premium plan: **15 free exports**, then
**paid Premium for unlimited**. Two billing modes, picked by env config:

- **Order mode (default, Standard Checkout)** — active when `RAZORPAY_PLAN_ID`
  is unset. Each one-time payment (`ORDER_AMOUNT_PAISE`, default ₹850) grants
  `PREMIUM_DAYS` (default 31) of Premium; paying again extends it.
- **Subscription mode** — set `RAZORPAY_PLAN_ID` and the checkout bills a
  $10/month auto-renewing Razorpay subscription instead.

## How the whole flow works

1. The plugin counts exports per Figma user in `figma.clientStorage`
   (`ft-export-count`). At 15, the Export button is replaced by an Upgrade
   prompt and the sandbox refuses further exports.
2. **Upgrade** (Account tab) opens `https://<this server>/checkout?uid=<figma user id>`
   in the browser. The page creates a Razorpay **subscription** on your plan
   (tagged with the Figma user id in `notes.figma_uid`) and runs Razorpay
   Checkout.
3. On success the page calls `/api/verify` (signature check:
   `HMAC-SHA256(payment_id|subscription_id, key_secret)`), which stores a
   license: `{ uid → subscriptionId, status, validUntil }` in `licenses.json`.
4. Back in the plugin, **“Refresh status”** (or the automatic once-per-session
   check) hits `GET /api/license/:uid`; a `premium: true` answer is cached in
   `figma.clientStorage` (`ft-premium`) so exports work offline. The cached
   expiry gets a 3-day grace so renewals never lock a paying user out.
5. Razorpay **webhooks** keep licenses honest after the first charge:
   `subscription.charged` extends `validUntil` to the new cycle end;
   `subscription.cancelled` / `halted` stop it from extending (users keep what
   they paid for until the cycle ends).

## Setup

1. **Razorpay dashboard**
   - Create API keys (start in **test mode**): Account & Settings → API Keys.
   - *(Subscription mode only)* Create a **Plan**: Subscriptions → Plans →
     monthly, $10 (USD needs international payments enabled on your account;
     or use the INR equivalent, e.g. ₹849 — then set `PRICE_LABEL` to match),
     and add a **Webhook**: URL `https://<this server>/api/webhook`, events
     `subscription.activated`, `subscription.charged`,
     `subscription.cancelled`, `subscription.halted`,
     `subscription.completed`. Note the signing secret. Order mode needs
     neither — keys alone are enough.
2. **Server**
   ```
   cd payment-server
   npm install
   copy .env.example .env    # then fill in the keys / plan id / webhook secret
   npm start
   ```
   Deploy anywhere that runs Node 18+ with a persistent disk (Render, Railway,
   a VPS). `licenses.json` lives next to `server.js` — on ephemeral-filesystem
   hosts, mount a disk for it or swap the `loadStore`/`saveStore` functions for
   a real database.
3. **Plugin** — point it at the deployed server (both places must match):
   - `figma-tableau-plugin/src/shared/constants.ts` → `PAYMENT_SERVER_URL`
   - `figma-tableau-plugin/manifest.json` → `networkAccess.allowedDomains`
     (replace `https://figma-tableau-pay.example.com`)
   Then rebuild (`npm run build`) and **re-import the manifest** in Figma.

## Testing end to end (test mode)

- Run locally (`npm run dev`, port 3000) — the manifest already dev-allows
  `http://localhost:3000`, and `PAYMENT_SERVER_URL` currently points there.
- Export 15 times (or pre-seed the counter from the plugin console:
  `figma.clientStorage.setAsync("ft-export-count", 15)`), hit the gate,
  click Upgrade, pay with a test method, then Refresh status.
- **Test payment methods that actually succeed** (test accounts accept
  DOMESTIC Indian payments only — `4111 1111 1111 1111` is an international
  Visa and fails with `international_transaction_not_allowed`):
  - UPI `success@razorpay` (always succeeds; `failure@razorpay` simulates a
    decline) — the most reliable option.
  - Netbanking: any bank → test page has an explicit "Success" button.
  - Domestic card: Mastercard `5267 3181 8797 5449`, any future expiry, any
    CVV, OTP = any 4–10 digits (fewer than 4 digits simulates failure). More
    numbers: https://razorpay.com/docs/payments/payments/test-card-details/
- **Debugging a failed payment**: query the payments API and read
  `error_reason` — from this folder:
  `node -e "require('dotenv').config();const https=require('https');const a=Buffer.from(process.env.RAZORPAY_KEY_ID+':'+process.env.RAZORPAY_KEY_SECRET).toString('base64');https.get({host:'api.razorpay.com',path:'/v1/payments?count=10',headers:{Authorization:'Basic '+a}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>JSON.parse(d).items.forEach(p=>console.log(p.id,p.status,p.method,p.error_reason||'',p.error_description||'')))})"
- Reset for another round: `figma.clientStorage.setAsync("ft-export-count", 0)`
  and `figma.clientStorage.deleteAsync("ft-premium")`.
- Webhooks on localhost need a tunnel (e.g. `ngrok http 3000`).

## Endpoints

| Endpoint | What it does |
| --- | --- |
| `GET /checkout?uid=&name=` | Hosted Razorpay checkout page (order or subscription mode) |
| `POST /api/create-order` | `{ uid, amount?, currency?, receipt? }` → creates a Standard Checkout order (min 100 paise) |
| `POST /api/verify-payment` | Verifies `HMAC(order_id\|payment_id)`, confirms the order amount, grants `PREMIUM_DAYS` |
| `POST /api/subscription` | `{ uid }` → creates the subscription (503 unless `RAZORPAY_PLAN_ID` set) |
| `POST /api/verify` | Verifies the subscription checkout signature, activates the license |
| `POST /api/webhook` | Razorpay webhook receiver (HMAC-verified; subscription renewals/cancellations) |
| `GET /api/license/:uid` | `{ premium, validUntil, status }` |
| `GET /healthz` | Liveness probe |

## Caveats

- **Figma Community policy**: plugins distributed through Figma Community that
  charge users are generally required to use Figma's own payments platform.
  This Razorpay flow is suited to private/org distribution or distribution
  outside Community review — check the current Figma developer terms before
  publishing publicly with third-party billing.
- The free-export counter is client-side (`clientStorage`) — a determined user
  can reset it. The paid license, however, is server-verified.
- `GET /api/license/:uid` is unauthenticated by design (the plugin iframe has
  a null origin and no secrets). It leaks only whether a Figma user id has a
  subscription; add an API token if that matters to you.
