import type { SocialPlatform, SocialStatus } from "./social";

export interface CalendarEventDetail {
  id: string;
  title: string;
  description?: string | null;
  text?: string | null;
  scheduled_at: string;
  type: "post" | "story";
  status: SocialStatus;
  platforms?: SocialPlatform[] | null;
  type_of_post?: string;
  type_of_story?: string;
  image?: string | null;
  video?: string | null;
  pdf?: string | null;
  account_type?: string | null;
  tags?: string[] | null;
}

