import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CheckCircle, XCircle } from "lucide-react";
import { 
  TokenExpirationInfo, 
  getTokenStatusBadgeVariant,
  getTokenStatusColor 
} from "@/hooks/useTokenExpiration";
import { cn } from "@/lib/utils";

interface TokenExpirationBadgeProps {
  expirationInfo: TokenExpirationInfo;
  showAccessToken?: boolean;
  showRefreshToken?: boolean;
  compact?: boolean;
}

export function TokenExpirationBadge({ 
  expirationInfo, 
  showAccessToken = true,
  showRefreshToken = true,
  compact = false,
}: TokenExpirationBadgeProps) {
  const { 
    accessTokenStatus, 
    refreshTokenStatus,
    displayText,
    needsReconnect,
  } = expirationInfo;

  // Get the icon based on status
  const getStatusIcon = (status: TokenExpirationInfo["accessTokenStatus"]) => {
    switch (status) {
      case "expired":
        return <XCircle className="h-3 w-3" />;
      case "expiring":
        return <AlertTriangle className="h-3 w-3" />;
      case "warning":
        return <Clock className="h-3 w-3" />;
      case "ok":
      default:
        return <CheckCircle className="h-3 w-3" />;
    }
  };

  // If we need to reconnect, show a prominent warning
  if (needsReconnect) {
    return (
      <div className="flex flex-col gap-1">
        <Badge 
          variant="destructive" 
          className="gap-1 text-xs"
        >
          <AlertTriangle className="h-3 w-3" />
          {refreshTokenStatus === "expired" ? "Reconnect Required" : `${displayText.refreshToken}`}
        </Badge>
      </div>
    );
  }

  if (compact) {
    // Compact mode: show only the most critical status
    const criticalStatus = refreshTokenStatus !== "ok" ? refreshTokenStatus : accessTokenStatus;
    const criticalText = refreshTokenStatus !== "ok" 
      ? displayText.refreshToken 
      : displayText.accessToken;

    if (!criticalText || criticalStatus === "ok") {
      return null;
    }

    return (
      <Badge 
        variant={getTokenStatusBadgeVariant(criticalStatus)}
        className={cn("gap-1 text-xs", getTokenStatusColor(criticalStatus))}
      >
        {getStatusIcon(criticalStatus)}
        {criticalText}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* Access Token Status */}
      {showAccessToken && displayText.accessToken && (
        <div className={cn("flex items-center gap-1", getTokenStatusColor(accessTokenStatus))}>
          {getStatusIcon(accessTokenStatus)}
          <span>{displayText.accessToken}</span>
        </div>
      )}
      
      {/* Refresh Token Status */}
      {showRefreshToken && displayText.refreshToken && (
        <div className={cn("flex items-center gap-1", getTokenStatusColor(refreshTokenStatus))}>
          {getStatusIcon(refreshTokenStatus)}
          <span>{displayText.refreshToken}</span>
        </div>
      )}
    </div>
  );
}
