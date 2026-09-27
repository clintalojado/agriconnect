import { Suspense, lazy, useEffect } from "react";
import { ToastProvider, Button, SkeletonList, EmptyState } from "./components/ui.jsx";
import { NavigationContext, navigate, useLocation } from "./lib/router";
import { RealtimeProvider } from "./lib/realtime.jsx";
import { ProfileProvider } from "./lib/profile.jsx";
import { useSession } from "./lib/session";
import { CallProvider } from "./calls/CallProvider.jsx";
import { NotificationsProvider } from "./shell/NotificationBell.jsx";
import AppShell from "./shell/AppShell.jsx";
import HomePage from "./home/HomePage.jsx";
import Onboarding from "./onboarding/Onboarding.jsx";
import FarmerDashboard from "./farmers/FarmerDashboard.jsx";
import Marketplace from "./farmers/Marketplace.jsx";
import ProductDetails from "./farmers/ProductDetails.jsx";
import CreateRequest from "./farmers/CreateRequest.jsx";
import MyRequests from "./farmers/MyRequests.jsx";
import AgriPoints from "./farmers/AgriPoints.jsx";
import RequestDetail from "./requests/RequestDetail.jsx";
import Orders from "./orders/Orders.jsx";
import OrderTracking from "./orders/OrderTracking.jsx";
import SupplierDirectory from "./suppliers/SupplierDirectory.jsx";
import SupplierProfile from "./suppliers/SupplierProfile.jsx";
import SupplierHome from "./suppliers/SupplierHome.jsx";
import MyQuotes from "./suppliers/MyQuotes.jsx";
import MyProducts from "./suppliers/MyProducts.jsx";
import PooledDemand from "./suppliers/PooledDemand.jsx";
import MessagesPage from "./messenger/MessagesPage.jsx";
import Community from "./community/Community.jsx";
import Settings from "./settings/Settings.jsx";
import StaffHome from "./staff/StaffHome.jsx";
import StaffInbox from "./staff/StaffInbox.jsx";
import Verification from "./staff/Verification.jsx";
import StaffRequests from "./staff/StaffRequests.jsx";
import SmsSimulator from "./admin/SmsSimulator.jsx";
import { SproutIcon } from "./components/icons.jsx";

// Lazy: the charts library is large and only the reports screen uses it.
const Reports = lazy(() => import("./admin/AdminDashboard.jsx"));

function Redirect({ to }) {
  useEffect(() => {
    navigate(to);
  }, [to]);
  return null;
}

function NotFound() {
  return (
    <EmptyState
      icon={SproutIcon}
      title="Page not found"
      description="That page doesn't exist for this account."
      action={<Button onClick={() => navigate("/dashboard")}>Go to dashboard</Button>}
    />
  );
}

// Shared routes (the same screen for several roles, with role-aware actions).
function shared(path, query) {
  const [first, second, third] = path;
  switch (first) {
    case "marketplace":
      return second === "product" && third ? <ProductDetails id={third} /> : <Marketplace query={query} />;
    case "requests":
      return second && second !== "new" ? <RequestDetail id={second} /> : null;
    case "orders":
      return second ? <OrderTracking id={second} /> : <Orders query={query} />;
    case "suppliers":
      return second ? <SupplierProfile id={second} /> : <SupplierDirectory query={query} />;
    case "messages":
      return <MessagesPage conversationId={Number(second) || null} query={query} />;
    case "community":
      return <Community />;
    case "settings":
      return <Settings />;
    default:
      return null;
  }
}

function farmerPage(path, query) {
  const [first, second] = path;
  if (first === "dashboard") return <FarmerDashboard />;
  if (first === "requests" && second === "new") return <CreateRequest query={query} />;
  if (first === "requests" && !second) return <MyRequests query={query} />;
  if (first === "points") return <AgriPoints />;
  return shared(path, query);
}

function supplierPage(path, query) {
  const [first] = path;
  if (first === "dashboard") return <SupplierHome />;
  if (first === "quotes") return <MyQuotes />;
  if (first === "products") return <MyProducts />;
  if (first === "pooled") return <PooledDemand query={query} />;
  if (first === "requests" && !path[1]) return <SupplierHome />;
  return shared(path, query);
}

function staffPage(path, query) {
  const [first, second] = path;
  if (first === "dashboard") return <StaffHome />;
  if (first === "inbox") return <StaffInbox />;
  if (first === "verification") return <Verification />;
  if (first === "requests" && !second) return <StaffRequests />;
  if (first === "simulator") return <SmsSimulator />;
  if (first === "reports")
    return (
      <Suspense fallback={<SkeletonList rows={3} />}>
        <Reports />
      </Suspense>
    );
  if (first === "messages" || first === "community") return null; // not part of the staff workspace
  return shared(path, query);
}

const PAGES = { farmer: farmerPage, supplier: supplierPage, staff: staffPage };

function Router() {
  const { path, query } = useLocation();
  const { role } = useSession();
  const first = path[0];

  if (first === "start") return <Onboarding initialRole={query.role} />;
  if (!role) return <HomePage />;
  if (!first) return <Redirect to="/dashboard" />; // signed in: "/" opens the dashboard

  const page = PAGES[role](path, query) || <NotFound />;
  return <AppShell current={first}>{page}</AppShell>;
}

export default function App() {
  return (
    <NavigationContext.Provider value={navigate}>
      <ToastProvider>
        <RealtimeProvider>
          <ProfileProvider>
            <NotificationsProvider>
              <CallProvider>
                <Router />
              </CallProvider>
            </NotificationsProvider>
          </ProfileProvider>
        </RealtimeProvider>
      </ToastProvider>
    </NavigationContext.Provider>
  );
}
