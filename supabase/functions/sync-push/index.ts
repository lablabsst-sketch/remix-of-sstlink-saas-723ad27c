// Outbound sync: receives a Database Webhook payload from THIS project
// and pushes the change to the EXTERNAL Supabase project.
//
// Configure as a Database Webhook in Supabase Dashboard → Database → Webhooks
// pointing to: https://<project-ref>.supabase.co/functions/v1/sync-push
// HTTP Method: POST
// HTTP Header: x-sync-secret = <SYNC_SHARED_SECRET>
//
// Webhook payload shape:
// { type: "INSERT"|"UPDATE"|"DELETE", table: "trabajadores", schema: "public",
//   record: {...}, old_record: {...} }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tables we replicate to the external project
const SYNC_TABLES = new Set([
  "empresas",
  "usuarios",
  "user_roles",
  "trabajadores",
  "documentos_trabajador",
  "documentos_empresa",
  "documentos_sgsst",
  "carpetas_sgsst",
  "capacitaciones",
  "asistencia_capacitacion",
  "accidentes",
  "ausencias",
  "examenes_medicos",
  "perfil_sociodemografico",
  "contratistas",
  "empleados_contratista",
  "clientes_portal",
  "trabajadores_cliente",
  "docs_empresa_cliente",
  "sedes",
  "activos",
  "plan_mejora",
  "items_plan_mejora",
  "docs_estandar",
  "empresa_estandares",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SHARED = Deno.env.get("SYNC_SHARED_SECRET");
  const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
  const EXT_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  const LOCAL_URL = Deno.env.get("SUPABASE_URL")!;
  const LOCAL_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!SHARED || !EXT_URL || !EXT_KEY) {
    return json({ error: "Sync no configurado (faltan secrets)." }, 500);
  }

  // Auth: shared secret OR service-role bearer
  const headerSecret = req.headers.get("x-sync-secret");
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  const ok = headerSecret === SHARED || bearer === LOCAL_KEY;
  if (!ok) return json({ error: "No autorizado." }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const type = String(payload?.type ?? "").toUpperCase();
  const table = String(payload?.table ?? "");
  const record = payload?.record ?? null;
  const oldRecord = payload?.old_record ?? null;

  if (!table || !SYNC_TABLES.has(table)) {
    return json({ skipped: true, reason: "Tabla no sincronizable.", table });
  }

  const local = createClient(LOCAL_URL, LOCAL_KEY, {
    auth: { persistSession: false },
  });
  const external = createClient(EXT_URL, EXT_KEY, {
    auth: { persistSession: false },
  });

  const empresaId =
    record?.empresa_id ?? oldRecord?.empresa_id ?? null;
  const registroId = String(record?.id ?? oldRecord?.id ?? "");

  // Mark payload so the receiver knows it came from sync (avoid loops)
  const markedRecord = record ? { ...record, __sync_origin: "lovable" } : null;

  let operation: "insert" | "update" | "delete";
  let error: string | null = null;

  try {
    if (type === "INSERT") {
      operation = "insert";
      const { error: e } = await external.from(table).upsert(record, {
        onConflict: "id",
      });
      if (e) error = e.message;
    } else if (type === "UPDATE") {
      operation = "update";
      const { error: e } = await external.from(table).upsert(record, {
        onConflict: "id",
      });
      if (e) error = e.message;
    } else if (type === "DELETE") {
      operation = "delete";
      const { error: e } = await external
        .from(table)
        .delete()
        .eq("id", registroId);
      if (e) error = e.message;
    } else {
      return json({ error: `Tipo desconocido: ${type}` }, 400);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    operation = (type.toLowerCase() as any) || "update";
  }

  await local.from("sync_log").insert({
    empresa_id: empresaId,
    direccion: "push",
    tabla: table,
    registro_id: registroId || null,
    operacion: operation!,
    estado: error ? "error" : "ok",
    mensaje_error: error,
    payload: { type, record: markedRecord, old_record: oldRecord },
  });

  if (error) {
    console.error("sync-push error:", table, error);
    return json({ ok: false, error }, 500);
  }
  return json({ ok: true, table, operation });
});
