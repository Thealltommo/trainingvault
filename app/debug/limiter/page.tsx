import { notFound } from "next/navigation";
import LimiterDebugClient from "./LimiterDebugClient";

export default function LimiterDebugPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <LimiterDebugClient />;
}
