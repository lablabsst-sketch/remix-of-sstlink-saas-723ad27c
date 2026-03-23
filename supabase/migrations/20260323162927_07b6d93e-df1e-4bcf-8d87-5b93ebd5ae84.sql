
-- 2. Update handle_new_user trigger to create empresa from metadata and assign super_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _empresa_id uuid;
  _meta jsonb;
  _nombre text;
  _apellido text;
  _full_name text;
BEGIN
  _meta := NEW.raw_user_meta_data;
  _full_name := COALESCE(_meta->>'nombre', NEW.email);
  _nombre := split_part(_full_name, ' ', 1);
  _apellido := NULLIF(trim(substr(_full_name, length(_nombre) + 1)), '');

  -- If empresa data is provided in metadata, create the empresa
  IF _meta->>'empresa_nombre' IS NOT NULL THEN
    INSERT INTO public.empresas (nombre, nit, sector_industria, num_empleados_directos, tiene_contratistas)
    VALUES (
      _meta->>'empresa_nombre',
      _meta->>'empresa_nit',
      _meta->>'empresa_sector',
      COALESCE((_meta->>'empresa_num_empleados')::int, 0),
      COALESCE((_meta->>'empresa_tiene_contratistas')::boolean, false)
    )
    RETURNING id INTO _empresa_id;
  END IF;

  -- Create user profile
  INSERT INTO public.usuarios (user_id, nombre, apellido, empresa_id)
  VALUES (NEW.id, _nombre, _apellido, _empresa_id);

  -- Assign role: super_admin if creating empresa, lector otherwise
  IF _empresa_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'lector');
  END IF;

  RETURN NEW;
END;
$function$;
