import type { SocialPlatform, SocialStatus } from "./social";

// Supabase "posts" row shape with normalized social fields.
export interface Post {
  id: string;
  title: string;
  description: string | null;
  status: SocialStatus;
  scheduled_at: string | null;
  type_of_post: string | null;
  platforms: SocialPlatform[] | null;
  account_type: string | null;
  text: string | null;
  image: string | null;
  video: string | null;
  pdf: string | null;
  url: string | null;
  tags: string[] | null;
  created_at: string;
}

