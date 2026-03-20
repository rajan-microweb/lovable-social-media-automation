export const SOCIAL_PLATFORMS = ["linkedin", "facebook", "instagram", "youtube", "twitter"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LINKEDIN = "linkedin" as const;
export const SOCIAL_PLATFORM_FACEBOOK = "facebook" as const;
export const SOCIAL_PLATFORM_INSTAGRAM = "instagram" as const;
export const SOCIAL_PLATFORM_YOUTUBE = "youtube" as const;
export const SOCIAL_PLATFORM_TWITTER = "twitter" as const;

export const SOCIAL_STATUSES = ["draft", "scheduled", "pending_approval", "published", "failed"] as const;
export type SocialStatus = (typeof SOCIAL_STATUSES)[number];

export const SOCIAL_STATUS_DRAFT = "draft" as const;
export const SOCIAL_STATUS_SCHEDULED = "scheduled" as const;
export const SOCIAL_STATUS_PENDING_APPROVAL = "pending_approval" as const;
export const SOCIAL_STATUS_PUBLISHED = "published" as const;
export const SOCIAL_STATUS_FAILED = "failed" as const;

export function normalizeSocialPlatform(value: string): SocialPlatform | null {
  const key = value.trim().toLowerCase();
  return (SOCIAL_PLATFORMS as readonly string[]).includes(key) ? (key as SocialPlatform) : null;
}

export function normalizeSocialStatus(value: string): SocialStatus | null {
  const key = value.trim().toLowerCase();
  return (SOCIAL_STATUSES as readonly string[]).includes(key) ? (key as SocialStatus) : null;
}

