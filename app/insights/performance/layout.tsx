import type { ReactNode } from "react";
import PerformanceLabDeepDive from "@/components/PerformanceLabDeepDive";

export default function PerformanceLabLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-5">
      {children}
      <PerformanceLabDeepDive />
    </div>
  );
}
