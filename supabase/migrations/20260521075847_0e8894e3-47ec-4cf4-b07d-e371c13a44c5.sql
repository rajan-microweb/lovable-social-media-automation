
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_content_approvals_from_posts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_content_approvals_from_stories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_publish_jobs_from_posts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_publish_jobs_from_stories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_platform_credentials() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_credentials(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_credentials(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
