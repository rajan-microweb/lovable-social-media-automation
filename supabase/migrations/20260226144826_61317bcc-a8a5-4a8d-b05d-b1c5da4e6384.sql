
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view post media" ON storage.objects;

-- Drop old ownership policies if they exist
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for post media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own post media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own post media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own post media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view post media files" ON storage.objects;

-- Create ownership-scoped policies
CREATE POLICY "Scoped upload to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Scoped update own files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Scoped delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public read post media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'post-media');

-- ====== FIX 2: Remove hardcoded encryption key fallback ======

CREATE OR REPLACE FUNCTION public.encrypt_credentials(credentials jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key text;
BEGIN
  encryption_key := current_setting('app.settings.jwt_secret', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key not configured - app.settings.jwt_secret must be set';
  END IF;
  
  RETURN encode(
    extensions.pgp_sym_encrypt(
      credentials::text,
      encryption_key,
      'compress-algo=1, cipher-algo=aes256'
    ),
    'base64'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_credentials(encrypted_creds text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key text;
  decrypted text;
BEGIN
  encryption_key := current_setting('app.settings.jwt_secret', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key not configured - app.settings.jwt_secret must be set';
  END IF;
  
  decrypted := extensions.pgp_sym_decrypt(
    decode(encrypted_creds, 'base64'),
    encryption_key
  );
  
  RETURN decrypted::jsonb;
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{}'::jsonb;
END;
$function$;
