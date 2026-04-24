
CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID,
  direccion TEXT NOT NULL CHECK (direccion IN ('push','receive')),
  tabla TEXT NOT NULL,
  registro_id TEXT,
  operacion TEXT NOT NULL CHECK (operacion IN ('insert','update','delete')),
  estado TEXT NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok','error')),
  mensaje_error TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_empresa_created ON public.sync_log(empresa_id, created_at DESC);
CREATE INDEX idx_sync_log_tabla_registro ON public.sync_log(tabla, registro_id);
CREATE INDEX idx_sync_log_estado ON public.sync_log(estado, created_at DESC);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven sync_log de su empresa"
ON public.sync_log
FOR SELECT
TO authenticated
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'administrador'::app_role))
);
