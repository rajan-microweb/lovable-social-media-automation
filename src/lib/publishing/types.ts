export type PublishPlatform = "facebook" | "instagram" | "threads" | "linkedin" | "youtube" | "x";

export type PublishTargetType = "personal" | "company" | "page" | "channel";

export interface PublishTarget {
  platform: PublishPlatform;
  target_id: string;
  target_type: PublishTargetType;
  name?: string;
}

export interface PublishRequest {
  platform: PublishPlatform;
  target: PublishTarget;
  text?: string;
  media_urls?: string[];
  scheduled_for?: string; // ISO string
  // Provider-specific extras can live under metadata
  metadata?: Record<string, unknown>;
}

