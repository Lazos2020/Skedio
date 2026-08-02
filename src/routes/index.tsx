import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import SkedioApp from "../skedio/App";

export const Route = createFileRoute("/")({
  component: Index,
});

// Skedio is a fully client-side app (IndexedDB, canvas, DOM APIs).
// Mount it only after hydration to avoid SSR access to browser-only APIs.
function Index() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] text-white">
        <Loader2 size={40} className="mb-4 animate-spin text-amber-400" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">
          Loading Skedio Engine...
        </h2>
      </div>
    );
  }

  return <SkedioApp />;
}
