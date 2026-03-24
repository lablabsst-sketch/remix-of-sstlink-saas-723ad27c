
-- Fix infinite recursion: create a security definer function to get empresa_id
CREATE OR REPLACE FUNCTION public.get_user_empresa_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.usuarios WHERE user_id = _user_id LIMIT 1
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Users in same empresa can view each other" ON public.usuarios;

-- Recreate it using the security definer function (no recursion)
CREATE POLICY "Users in same empresa can view each other"
ON public.usuarios FOR SELECT TO authenticated
USING (empresa_id = get_user_empresa_id(auth.uid()));

-- Also fix trabajadores policies that reference usuarios directly
DROP POLICY IF EXISTS "Users can view own company workers" ON public.trabajadores;
CREATE POLICY "Users can view own company workers"
ON public.trabajadores FOR SELECT TO authenticated
USING (empresa_id = get_user_empresa_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert workers" ON public.trabajadores;
CREATE POLICY "Admins can insert workers"
ON public.trabajadores FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = get_user_empresa_id(auth.uid())
  AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'administrador'))
);

DROP POLICY IF EXISTS "Admins can update workers" ON public.trabajadores;
CREATE POLICY "Admins can update workers"
ON public.trabajadores FOR UPDATE TO authenticated
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'administrador'))
);

DROP POLICY IF EXISTS "Admins can delete workers" ON public.trabajadores;
CREATE POLICY "Admins can delete workers"
ON public.trabajadores FOR DELETE TO authenticated
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'administrador'))
);
