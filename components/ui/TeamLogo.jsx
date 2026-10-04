"use client";

import { useState } from "react";
import { getTeamLogoUrl, getTeamInitials } from "@/utils/gameUtils";
import { DARK_LOGOS } from "@/utils/consts";

const SIZES = {
  xs: "w-6 h-6 text-[8px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-xs",
};

// Logos sit next to the team name almost everywhere, so they're decorative by
// default (alt=""). Pass `alt` where the logo stands on its own.
export default function TeamLogo({ teamName, hebrewName, size = "md", className = "", alt = "" }) {
  const [hasError, setHasError] = useState(false);
  const sizeClasses = SIZES[size] || SIZES.md;

  if (hasError || !teamName) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`${sizeClasses} bg-gradient-to-br from-gray-300 to-gray-400 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${className}`}
      >
        {getTeamInitials(hebrewName || teamName)}
      </div>
    );
  }

  return (
    <img
      src={getTeamLogoUrl(teamName)}
      alt={alt}
      className={`${sizeClasses} object-contain ${DARK_LOGOS.has(teamName) ? "logo-on-dark" : ""} ${className}`}
      onError={() => setHasError(true)}
    />
  );
}
