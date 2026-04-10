import { supabase } from "@/integrations/supabase/client";

export type ContentApprovalStatus = "pending" | "approved" | "rejected";
export type ContentType = "post" | "story";
export type ApprovalDecision = "approved" | "rejected";

export type ContentApprovalItem = {
  id: string;
  workspace_id: string;
  content_type: ContentType;
  content_id: string;
  approval_status: ContentApprovalStatus;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  // UI-friendly fields
  contentTitle: string;
  scheduled_at: string | null;
  requestedByName?: string;
};

function fallbackTitle(opts: { contentType: ContentType; text?: string | null; title?: string | null }): string {
  const { contentType, text, title } = opts;
  if (title && title.trim()) return title;
  if (text && text.trim()) return `${text.trim().slice(0, 80)}${text.trim().length > 80 ? "…" : ""}`;
  return contentType === "post" ? "(Untitled post)" : "(Untitled story)";
}

export async function fetchPendingApprovalsForWorkspace(workspaceId: string): Promise<ContentApprovalItem[]> {
  const { data: approvals, error: approvalsError } = await supabase
    .from("content_approvals")
    .select(
      "id,workspace_id,content_type,content_id,approval_status,requested_by,requested_at,note,reviewed_by,reviewed_at"
    )
    .eq("workspace_id", workspaceId)
    .eq("approval_status", "pending")
    .order("requested_at", { ascending: false });

  if (approvalsError) throw approvalsError;

  const rows = (approvals ?? []) as Array<ContentApprovalItem>;

  const postIds = rows.filter((r) => r.content_type === "post").map((r) => r.content_id);
  const storyIds = rows.filter((r) => r.content_type === "story").map((r) => r.content_id);
  const userIds = Array.from(new Set(rows.map((r) => r.requested_by)));

  const [{ data: posts }, { data: stories }, { data: profiles }] = await Promise.all([
    postIds.length ? supabase.from("posts").select("id,title,text,scheduled_at").in("id", postIds) : Promise.resolve({ data: [] }),
    storyIds.length ? supabase.from("stories").select("id,title,text,scheduled_at").in("id", storyIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("profiles").select("id,name").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);

  const postById = new Map((posts ?? []).map((p: any) => [p.id, p]));
  const storyById = new Map((stories ?? []).map((s: any) => [s.id, s]));
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return rows.map((r) => {
    const contentRow = r.content_type === "post" ? postById.get(r.content_id) : storyById.get(r.content_id);
    const contentTitle = fallbackTitle({
      contentType: r.content_type,
      title: contentRow?.title ?? null,
      text: contentRow?.text ?? null,
    });

    return {
      ...r,
      contentTitle,
      scheduled_at: contentRow?.scheduled_at ?? null,
      requestedByName: profileById.get(r.requested_by)?.name ?? undefined,
    };
  });
}

export async function reviewContentApproval(params: {
  workspaceId: string;
  contentType: ContentType;
  contentId: string;
  decision: ApprovalDecision;
  note?: string | null;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke("review-content-approval", {
    body: {
      content_type: params.contentType,
      content_id: params.contentId,
      decision: params.decision,
      note: params.note ?? null,
    },
  });

  if (error) throw error;
  if (data && data.success === false) {
    throw new Error(data.error || "Failed to review content approval");
  }
}

