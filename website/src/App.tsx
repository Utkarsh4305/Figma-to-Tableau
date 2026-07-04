import { Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import SiteLayout from "./components/layout/SiteLayout";
import Home from "./pages/Home";
import Upgrade from "./pages/Upgrade";
import PricingPage from "./pages/PricingPage";
import FeaturesPage from "./pages/FeaturesPage";
import Docs from "./pages/Docs";
import Blog from "./pages/Blog";
import Login from "./pages/Login";
import Account from "./pages/Account";
import Activate from "./pages/Activate";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
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
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/blog" element={<Blog />} />
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
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<Account />} />
          <Route path="/activate" element={<Activate />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
