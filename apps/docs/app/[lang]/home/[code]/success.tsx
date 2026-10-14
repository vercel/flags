"use client"

import { track } from "@vercel/analytics";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function Success({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const params = useSearchParams()

  useEffect(() => {
    setTimeout(() => {
      console.log("success page loaded", params.toString())
      if (params.has("success")) { return }

      track("purchase", {
        visitorId: document.cookie.split("; ").find(row => row.startsWith("visitorId="))?.split("=")[1] ?? ""
      })
    }, 10)
  }, [params])

  return (
    <button {...props} className="bg-green-500 text-white px-4 py-2 rounded">
      click
    </button>
  );
}
