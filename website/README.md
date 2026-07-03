# Figma to Tableau — Marketing website

Standalone site for the plugin: premium purchase entry point, pricing, and
stable URLs for everything that ships later (docs, blog, auth, account
dashboard, license activation).

**Stack**: Vite + React + TypeScript, react-router, framer-motion, lucide-react.
Fonts: Clash Display / Satoshi (Fontshare) + JetBrains Mono (Google).

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks then bundles to dist/
```

## How the premium flow works

1. Every premium CTA inside the plugin opens
   `<site>/upgrade?uid=<figma user id>&name=<display name>`.
2. `/upgrade` shows the plan and hands off to the backend's hosted Razorpay
   checkout: `<backend>/checkout?uid=…` (see `src/config.ts` →
   `BACKEND_URL`, overridable with `VITE_BACKEND_URL`).
3. After paying, the user returns to the plugin and clicks **Refresh status**
   (Account tab) — the plugin polls `GET <backend>/api/license/:uid`.

Someone landing on `/upgrade` without a `uid` (e.g. from the navbar) is told
checkout starts from the plugin's Account tab, so the license can be tied to
their Figma account.

## Structure

```
src/config.ts                    URLs, price labels, checkout URL builder
src/App.tsx                      route map (placeholders keep future URLs stable)
src/components/layout/           Navbar, Footer, Logo, SiteLayout
src/components/ui/               Reveal, SectionHeading, Accordion, CountUp
src/components/illustrations/    FigmaFrame, TableauDashboard, FlowBeam (custom SVG)
src/sections/                    Hero, HowItWorks, Features, Demo, Benefits,
                                 Pricing, Faq, CtaBanner
src/pages/                       Home, Upgrade, PricingPage, Placeholder, NotFound
src/styles/                      global (tokens) / layout / sections / pages
```

## Before shipping

- Set `VITE_BACKEND_URL` to the deployed backend (default: `http://localhost:3000`).
- Point `PLUGIN_URL` in `src/config.ts` at the real Figma Community listing.
- Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages) with a
  SPA fallback (`/* → /index.html`) so the client-side routes resolve.
- Mirror the deployed site URL in the plugin: `WEBSITE_URL` in
  `figma-tableau-plugin/src/shared/constants.ts` + `manifest.json`
  `networkAccess.allowedDomains`, then rebuild and re-import the manifest.
