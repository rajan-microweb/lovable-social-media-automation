import type { SocialPlatform, SocialStatus } from "./social";

// Supabase "stories" row shape with normalized social fields.
export interface Story {
  id: string;
  title: string;
  description: string | null;
  status: SocialStatus;
  scheduled_at: string | null;
  type_of_story: string | null;
  platforms: SocialPlatform[] | null;
  account_type: string | null;
  text: string | null;
  image: string | null;
  video: string | null;
  updated_at?: string;
  created_at?: string;
}

