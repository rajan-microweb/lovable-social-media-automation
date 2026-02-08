import { useMemo } from "react";

export interface TokenExpirationInfo {
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  accessTokenDaysRemaining: number | null;
  refreshTokenDaysRemaining: number | null;
  accessTokenStatus: "ok" | "warning" | "expiring" | "expired";
  refreshTokenStatus: "ok" | "warning" | "expiring" | "expired";
  needsReconnect: boolean;
  displayText: {
    accessToken: string | null;
    refreshToken: string | null;
  };
}

/**
 * Calculates token expiration status from credentials
 */
export function calculateTokenExpiration(credentials: Record<string, unknown> | null): TokenExpirationInfo {
  const now = new Date();
  
  // Extract expiration timestamps (support both formats)
  const accessTokenExpiresAt = (credentials?.expires_at || credentials?.expiresAt) as string | null;
  const refreshTokenExpiresAt = (credentials?.refresh_token_expires_at || credentials?.refreshTokenExpiresAt) as string | null;

  let accessTokenDaysRemaining: number | null = null;
  let refreshTokenDaysRemaining: number | null = null;
  let accessTokenStatus: TokenExpirationInfo["accessTokenStatus"] = "ok";
  let refreshTokenStatus: TokenExpirationInfo["refreshTokenStatus"] = "ok";

  // Calculate access token days remaining
  if (accessTokenExpiresAt) {
    const expiresDate = new Date(accessTokenExpiresAt);
    accessTokenDaysRemaining = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (accessTokenDaysRemaining <= 0) {
      accessTokenStatus = "expired";
    } else if (accessTokenDaysRemaining <= 7) {
      accessTokenStatus = "expiring";
    } else if (accessTokenDaysRemaining <= 14) {
      accessTokenStatus = "warning";
    }
  }

  // Calculate refresh token days remaining
  if (refreshTokenExpiresAt) {
    const expiresDate = new Date(refreshTokenExpiresAt);
    refreshTokenDaysRemaining = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (refreshTokenDaysRemaining <= 0) {
      refreshTokenStatus = "expired";
    } else if (refreshTokenDaysRemaining <= 7) {
      refreshTokenStatus = "expiring";
    } else if (refreshTokenDaysRemaining <= 30) {
      refreshTokenStatus = "warning";
    }
  }

  // Needs reconnect if refresh token is expiring/expired
  const needsReconnect = refreshTokenStatus === "expired" || refreshTokenStatus === "expiring";

  // Generate display text
  const displayText = {
    accessToken: formatTimeRemaining(accessTokenDaysRemaining, "Token"),
    refreshToken: formatTimeRemaining(refreshTokenDaysRemaining, "Reconnect in"),
  };

  return {
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    accessTokenDaysRemaining,
    refreshTokenDaysRemaining,
    accessTokenStatus,
    refreshTokenStatus,
    needsReconnect,
    displayText,
  };
}

/**
 * Formats days remaining into a human-readable string
 */
function formatTimeRemaining(days: number | null, prefix: string): string | null {
  if (days === null) return null;
  
  if (days <= 0) {
    return "Expired";
  } else if (days === 1) {
    return `${prefix}: 1 day`;
  } else if (days < 30) {
    return `${prefix}: ${days} days`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    return `${prefix}: ${months} month${months > 1 ? "s" : ""}`;
  } else {
    const years = Math.floor(days / 365);
    const remainingMonths = Math.floor((days % 365) / 30);
    if (remainingMonths > 0) {
      return `${prefix}: ${years}y ${remainingMonths}m`;
    }
    return `${prefix}: ${years} year${years > 1 ? "s" : ""}`;
  }
}

/**
 * Hook to get token expiration info with memoization
 */
export function useTokenExpiration(credentials: Record<string, unknown> | null): TokenExpirationInfo {
  return useMemo(() => calculateTokenExpiration(credentials), [credentials]);
}

/**
 * Returns the appropriate badge variant based on token status
 */
export function getTokenStatusBadgeVariant(
  status: TokenExpirationInfo["accessTokenStatus"] | TokenExpirationInfo["refreshTokenStatus"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "expired":
    case "expiring":
      return "destructive";
    case "warning":
      return "secondary";
    case "ok":
    default:
      return "outline";
  }
}

/**
 * Returns the appropriate color class based on token status
 */
export function getTokenStatusColor(
  status: TokenExpirationInfo["accessTokenStatus"] | TokenExpirationInfo["refreshTokenStatus"]
): string {
  switch (status) {
    case "expired":
      return "text-destructive";
    case "expiring":
      return "text-orange-500";
    case "warning":
      return "text-yellow-600";
    case "ok":
    default:
      return "text-green-600";
  }
}
