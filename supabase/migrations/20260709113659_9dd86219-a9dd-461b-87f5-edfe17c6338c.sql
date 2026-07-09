
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS user_email text;

UPDATE public.user_roles ur
SET user_name = p.name,
    user_email = p.email
FROM public.profiles p
WHERE p.id = ur.user_id
  AND (ur.user_name IS NULL OR ur.user_email IS NULL);

CREATE OR REPLACE FUNCTION public.populate_user_roles_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_name IS NULL OR NEW.user_email IS NULL THEN
    SELECT COALESCE(NEW.user_name, p.name),
           COALESCE(NEW.user_email, p.email)
      INTO NEW.user_name, NEW.user_email
    FROM public.profiles p
    WHERE p.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_populate_identity ON public.user_roles;
CREATE TRIGGER trg_user_roles_populate_identity
BEFORE INSERT OR UPDATE OF user_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.populate_user_roles_identity();

CREATE OR REPLACE FUNCTION public.sync_user_roles_from_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_roles
  SET user_name = NEW.name,
      user_email = NEW.email
  WHERE user_id = NEW.id
    AND (user_name IS DISTINCT FROM NEW.name OR user_email IS DISTINCT FROM NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_user_roles ON public.profiles;
CREATE TRIGGER trg_profiles_sync_user_roles
AFTER UPDATE OF name, email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_user_roles_from_profiles();
