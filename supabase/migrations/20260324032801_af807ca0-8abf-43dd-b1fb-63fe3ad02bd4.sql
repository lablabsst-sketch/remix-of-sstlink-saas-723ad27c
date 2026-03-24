-- Create trabajadores table
CREATE TABLE public.trabajadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombres text NOT NULL,
  apellidos text NOT NULL,
  tipo_documento text NOT NULL DEFAULT 'CC',
  numero_documento text NOT NULL,
  cargo text,
  email text,
  estado text NOT NULL DEFAULT 'pendiente',
  fecha_ingreso date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trabajadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company workers"
ON public.trabajadores FOR SELECT TO authenticated
USING (
  empresa_id IN (
    SELECT u.empresa_id FROM public.usuarios u WHERE u.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can insert workers"
ON public.trabajadores FOR INSERT TO authenticated
WITH CHECK (
  empresa_id IN (
    SELECT u.empresa_id FROM public.usuarios u WHERE u.user_id = auth.uid()
  )
  AND (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'administrador')
  )
);

CREATE POLICY "Admins can update workers"
ON public.trabajadores FOR UPDATE TO authenticated
USING (
  empresa_id IN (
    SELECT u.empresa_id FROM public.usuarios u WHERE u.user_id = auth.uid()
  )
  AND (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'administrador')
  )
);

CREATE POLICY "Admins can delete workers"
ON public.trabajadores FOR DELETE TO authenticated
USING (
  empresa_id IN (
    SELECT u.empresa_id FROM public.usuarios u WHERE u.user_id = auth.uid()
  )
  AND (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'administrador')
  )
);

CREATE TRIGGER set_trabajadores_updated_at
  BEFORE UPDATE ON public.trabajadores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();