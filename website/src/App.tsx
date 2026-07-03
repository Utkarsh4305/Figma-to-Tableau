import { Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import SiteLayout from "./components/layout/SiteLayout";
import Home from "./pages/Home";
import Upgrade from "./pages/Upgrade";
import PricingPage from "./pages/PricingPage";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";

/** Scroll to top on route change (hash links keep native smooth-scroll). */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

/**
 * Route map. The placeholder routes are intentional: auth, license
 * activation, the account dashboard, docs, and the blog each get a stable
 * URL today so the plugin/backend can link to them, and a real page can drop
 * in later without touching anything else.
 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route
            path="/docs"
            element={
              <Placeholder
                title="Documentation"
                blurb="Layer-naming syntax (SHEET/, KPI/, Nav/…), export modes, worksheet swapping, and troubleshooting guides are moving here from the plugin's Library tab."
              />
            }
          />
          <Route
            path="/blog"
            element={
              <Placeholder
                title="Blog"
                blurb="Deep dives on design-to-dashboard workflows, Tableau layout internals, and release notes."
              />
            }
          />
          <Route
            path="/contact"
            element={
              <Placeholder
                title="Contact"
                blurb="Partnerships, enterprise plans, or press — we'd love to talk."
                showSupportEmail
              />
            }
          />
          <Route
            path="/support"
            element={
              <Placeholder
                title="Support"
                blurb="Stuck on an export, a payment, or a license? Send us the details and we'll get you unblocked."
                showSupportEmail
              />
            }
          />
          <Route
            path="/login"
            element={
              <Placeholder
                title="Sign in"
                blurb="Account sign-in is coming with the web dashboard. Today your license is tied to your Figma account — manage it from the plugin's Account tab."
              />
            }
          />
          <Route
            path="/account"
            element={
              <Placeholder
                title="Account dashboard"
                blurb="Subscription management, invoices, and usage analytics are on the roadmap. Your Premium status currently lives in the plugin's Account tab."
              />
            }
          />
          <Route
            path="/activate"
            element={
              <Placeholder
                title="License activation"
                blurb="Licenses activate automatically after checkout — open the plugin and click “Refresh status” on the Account tab. Manual key activation lands here later."
              />
            }
          />
          <Route
            path="/privacy"
            element={
              <Placeholder
                title="Privacy policy"
                blurb="Short version: your designs never leave Figma — generation happens locally in the plugin. Billing is processed by Razorpay; we store only your Figma user id and license status."
              />
            }
          />
          <Route
            path="/terms"
            element={
              <Placeholder
                title="Terms of service"
                blurb="The formal terms are being finalized ahead of public launch."
              />
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
