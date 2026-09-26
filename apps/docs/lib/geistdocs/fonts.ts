import { GeistSans } from "geist/font/sans";
import { Geist_Mono as createMono } from "next/font/google";

export const sans = GeistSans;

export const mono = createMono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});
