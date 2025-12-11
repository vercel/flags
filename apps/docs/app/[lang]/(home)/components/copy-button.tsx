"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const CopyButton = ({ code }: { code: string }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy code");
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className="-m-2 shrink-0"
      onClick={handleCopy}
      size="icon"
      variant="ghost"
    >
      <Icon size={16} />
    </Button>
  );
};
