"use client";

import { useTreeContext } from "fumadocs-ui/contexts/tree";
import { ChevronDownIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "../ui/button";

type Tab = {
  title: string;
  url: string;
  icon: ReactNode;
  description: string;
};

const tabs: Tab[] = [
  {
    title: "Next.js",
    url: "/docs/frameworks/next",
    icon: (
      <svg
        height="16"
        strokeLinejoin="round"
        viewBox="0 0 16 16"
        width="16"
        style={{ color: "currentcolor" }}
      >
        <g clipPath="url(#clip0_53_108)">
          <circle
            cx="8"
            cy="8"
            r="7.375"
            fill="black"
            stroke="var(--ds-gray-1000)"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.63 11V5"
            stroke="url(#paint0_linear_53_108S1)"
            strokeWidth="1.25"
            strokeMiterlimit="1.41421"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.995 5.00087V5H4.745V11H5.995V6.96798L12.3615 14.7076C12.712 14.4793 13.0434 14.2242 13.353 13.9453L5.99527 5.00065L5.995 5.00087Z"
            fill="url(#paint1_linear_53_108S1)"
          />
        </g>
        <defs>
          <linearGradient
            id="paint0_linear_53_108S1"
            x1="11.13"
            y1="5"
            x2="11.13"
            y2="11"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="white" />
            <stop
              offset="0.609375"
              stopColor="white"
              stopOpacity="0.57"
            />
            <stop
              offset="0.796875"
              stopColor="white"
              stopOpacity="0"
            />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="paint1_linear_53_108S1"
            x1="9.9375"
            y1="9.0625"
            x2="13.5574"
            y2="13.3992"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="white" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <clipPath id="clip0_53_108">
            <rect width="16" height="16" fill="red" />
          </clipPath>
        </defs>
      </svg>
    ),
    description: "Flags SDK for Next.js",
  },
  {
    title: "SvelteKit",
    url: "/docs/frameworks/sveltekit",
    icon: (
      <svg
        className="grayscale"
        height="16"
        strokeLinejoin="round"
        viewBox="0 0 16 16"
        width="16"
        style={{ color: "currentcolor" }}
      >
        <path
          d="M13.7974 2.11525C12.3195 -0.0135593 9.37709 -0.637288 7.26183 0.705085L3.53302 3.09153C2.51607 3.72881 1.81098 4.77288 1.60759 5.95254C1.43132 6.94237 1.58048 7.95932 2.05505 8.84068C1.72963 9.32881 1.51268 9.87119 1.41776 10.4407C1.20082 11.6475 1.48556 12.8949 2.19065 13.8847C3.68217 16.0136 6.61098 16.6373 8.72624 15.2949L12.4551 12.922C13.472 12.2847 14.1771 11.2407 14.3805 10.061C14.5567 9.07119 14.4076 8.05424 13.933 7.17288C14.2584 6.68475 14.4754 6.14237 14.5703 5.57288C14.8008 4.35254 14.5161 3.10508 13.7974 2.11525Z"
          fill="#FF3E00"
        />
        <path
          d="M6.8958 14.0881C5.68902 14.4 4.428 13.9254 3.72292 12.9085C3.28902 12.3119 3.12631 11.5661 3.24834 10.8339C3.27546 10.7119 3.30258 10.6034 3.3297 10.4814L3.3975 10.2644L3.58733 10.4C4.03478 10.7254 4.52292 10.9695 5.05173 11.1322L5.18733 11.1729L5.17377 11.3085C5.16021 11.4983 5.21445 11.7017 5.32292 11.8644C5.53987 12.1763 5.91953 12.3254 6.28563 12.2305C6.36699 12.2034 6.44834 12.1763 6.51614 12.1356L10.2314 9.76271C10.4212 9.64068 10.5433 9.46441 10.5839 9.24746C10.6246 9.03051 10.5704 8.8 10.4483 8.62373C10.2314 8.31186 9.85173 8.17627 9.48563 8.27119C9.40428 8.29831 9.32292 8.32542 9.25512 8.3661L7.83139 9.27458C7.60089 9.42373 7.34326 9.5322 7.07207 9.6C5.86529 9.91187 4.60428 9.43729 3.89919 8.42034C3.47885 7.82373 3.30258 7.07797 3.43817 6.34576C3.56021 5.64068 3.99411 5.00339 4.60428 4.62373L8.33309 2.25085C8.5636 2.1017 8.82123 1.99322 9.09241 1.91186C10.2992 1.6 11.5602 2.07458 12.2653 3.09153C12.6992 3.68814 12.8619 4.4339 12.7399 5.1661C12.7128 5.28814 12.6856 5.39661 12.645 5.51864L12.5772 5.73559L12.3873 5.6C11.9399 5.27458 11.4517 5.03051 10.9229 4.8678L10.7873 4.82712L10.8009 4.69153C10.8144 4.50169 10.7602 4.29831 10.6517 4.13559C10.4348 3.82373 10.0551 3.68814 9.68902 3.78305C9.60767 3.81017 9.52631 3.83729 9.45851 3.87797L5.74326 6.25085C5.55343 6.37288 5.43139 6.54915 5.39072 6.7661C5.35004 6.98305 5.40428 7.21356 5.52631 7.38983C5.74326 7.7017 6.12292 7.83729 6.48902 7.74237C6.57038 7.71525 6.65173 7.68814 6.71953 7.64746L8.14326 6.73898C8.37377 6.58983 8.63139 6.48136 8.90258 6.4C10.1094 6.08814 11.3704 6.56271 12.0755 7.57966C12.5094 8.17627 12.6721 8.92203 12.55 9.65424C12.428 10.3593 11.9941 10.9966 11.3839 11.3763L7.65512 13.7492C7.42461 13.8983 7.16699 14.0068 6.8958 14.0881Z"
          fill="white"
        />
        <defs>
          <clipPath id="clip0_53_108_svelte">
            <rect width="16" height="16" fill="white" />
          </clipPath>
        </defs>
      </svg>
    ),
    description: "Flags SDK for SvelteKit",
  },
];

export const FrameworkSwitcher = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (tabs.length < 2 || !pathname.startsWith("/docs/frameworks/")) {
    return null;
  }

  const activeTab = tabs.find((tab) => pathname.startsWith(tab.url));

  if (!activeTab) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="ghost"
          className="h-auto text-left shadow-none mb-4 gap-4"
        >
          {activeTab.icon ? (
            <div className="size-4">
              {activeTab.icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm">
              {activeTab.title}
            </div>
            {activeTab.description ? (
              <div className="truncate text-muted-foreground text-xs">
                {activeTab.description}
              </div>
            ) : null}
          </div>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-1"
      >
        {tabs.map((tab) => (
          <Button
            key={tab.url}
            type="button"
            className="h-auto text-left shadow-none gap-4 w-full justify-start"
            variant="ghost"
            onClick={() => {
              router.push(tab.url);
              setOpen(false);
            }}
          >
            {tab.icon ? (
              <div className="size-4">
                {tab.icon}
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">{tab.title}</div>
              {tab.description ? (
                <div className="truncate text-muted-foreground text-xs">
                  {tab.description}
                </div>
              ) : null}
            </div>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
