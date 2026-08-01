"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function CompletedReviewRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (window.location.hash !== "#post-session-review") return;
    const match = pathname.match(/^\/session\/([^/]+)$/);
    if (!match) return;
    router.replace(`/session/${encodeURIComponent(match[1])}/review`);
  }, [pathname, router]);

  return null;
}
