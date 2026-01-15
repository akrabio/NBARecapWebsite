"use client";

import React, { useState } from "react";
import { getTeamLogoUrl, getTeamInitials } from "@/utils/gameUtils";

const SIZES = {
  xs: "w-6 h-6 text-[8px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-xs",
  lg: "w-20 h-20 text-lg",
  xl: "w-24 h-24 text-xl md:w-28 md:h-28",
  "2xl": "w-24 h-24 md:w-32 md:h-32 text-2xl md:text-3xl",
};

export default function TeamLogo({
  teamName,
  hebrewName,
  size = "md",
  className = "",
  showFallbackCircle = true
}) {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = SIZES[size] || SIZES.md;
  const initials = getTeamInitials(hebrewName || teamName);

  if (hasError) {
    if (showFallbackCircle) {
      return (
        <div
          className={`${sizeClasses} bg-gradient-to-br from-gray-300 to-gray-400 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${className}`}
        >
          {initials}
        </div>
      );
    }
    return (
      <div className={`${sizeClasses} flex items-center justify-center font-black text-gray-700 ${className}`}>
        {initials}
      </div>
    );
  }

  return (
    <img
      src={getTeamLogoUrl(teamName)}
      alt={`${hebrewName || teamName} logo`}
      className={`${sizeClasses} object-contain ${className}`}
      onError={() => setHasError(true)}
    />
  );
}
