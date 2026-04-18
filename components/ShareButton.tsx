"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

type ShareButtonProps = {
  label?: string;
  getUrl?: () => string;
  className?: string;
};

export function ShareButton({ label = "Share", getUrl, className = "button" }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = getUrl ? getUrl() : window.location.href;

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className={className} type="button" onClick={copyLink}>
      <Share2 size={18} aria-hidden="true" />
      <span className="button-label-stable">{copied ? "Copied" : label}</span>
    </button>
  );
}
