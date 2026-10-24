import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router";

import { AppShell } from "./components/AppShell";
import { PageHeader, Skeleton } from "./components/ui";
import DecisionDesk from "./pages/DecisionDesk";

// The landing page ships in the main bundle; the others load on first visit.
const Accuracy = lazy(() => import("./pages/Accuracy"));
const Methodology = lazy(() => import("./pages/Methodology"));

function NotFound() {
  return (
    <PageHeader
      title="Page not found"
      description={
        <>
          That page doesn&apos;t exist.{" "}
          <Link to="/" className="font-medium text-forecast hover:underline">
            Back to the decision desk
          </Link>
          .
        </>
      }
    />
  );
}

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Routes>
          <Route path="/" element={<DecisionDesk />} />
          <Route path="/accuracy" element={<Accuracy />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
