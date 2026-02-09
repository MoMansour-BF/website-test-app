"use client";

import Image from "next/image";

interface BrandLogoProps {
  variant?: "full" | "icon";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const iconSizes = { sm: 32, md: 40, lg: 48 };
const fullHeights = { sm: 28, md: 36, lg: 44 };

export function BrandLogo({
  variant = "full",
  size = "md",
  className = "",
}: BrandLogoProps) {
  if (variant === "icon") {
    return (
      <Image
        src="/logo-small.png"
        alt="Journeys by Breadfast"
        width={iconSizes[size]}
        height={iconSizes[size]}
        className={`object-contain ${className}`}
        priority
      />
    );
  }

  return (
    <Image
      src="/logo-full.png"
      alt="Journeys by Breadfast"
      width={160}
      height={fullHeights[size]}
      className={`object-contain object-left ${className}`}
      priority
    />
  );
}
