// Inbound sync: receives a Database Webhook payload from the EXTERNAL project
// and applies the change to THIS project.
//
// Configure in the EXTERNAL Supabase Dashboard → Database → Webhooks
// pointing to: https://<this-project-ref>.supabase.co/functions/v1/sync-receive
// HTTP Method: POST
// HTTP Header: x-sync-secret = <SYNC_SHARED_SECRET>
//
// To prevent infinite loops, sync-push tags records with __sync_origin="lovable"
// and sync-receive ignores anything with that marker.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function clean(record: any): any {
  if (!record || typeof record !== "object") return record;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === "__sync_origin") continue;
    out[k] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SHARED = Deno.env.get("SYNC_SHARED_SECRET");
  const LOCAL_URL = Deno.env.get("SUPABASE_URL")!;
  const LOCAL_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!SHARED) {
    return json({ error: "SYNC_SHARED_SECRET no configurado." }, 500);
  }

  const headerSecret = req.headers.get("x-sync-secret");
  if (headerSecret !== SHARED) {
    return json({ error: "No autorizado." }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const type = String(payload?.type ?? "").toUpperCase();
  const table = String(payload?.table ?? "");
  const rawRecord = payload?.record ?? null;
  const oldRecord = payload?.old_record ?? null;

  if (!table || !SYNC_TABLES.has(table)) {
    return json({ skipped: true, reason: "Tabla no sincronizable.", table });
  }

  // Loop guard: if the record already came from us, skip
  if (rawRecord && (rawRecord as any).__sync_origin === "lovable") {
    return json({ skipped: true, reason: "Origen lovable (loop guard)." });
  }

  const record = clean(rawRecord);
  const empresaId = record?.empresa_id ?? oldRecord?.empresa_id ?? null;
  const registroId = String(record?.id ?? oldRecord?.id ?? "");

  const local = createClient(LOCAL_URL, LOCAL_KEY, {
    auth: { persistSession: false },
  });

  let operation: "insert" | "update" | "delete";
  let error: string | null = null;

  try {
    if (type === "INSERT" || type === "UPDATE") {
      operation = type === "INSERT" ? "insert" : "update";
      const { error: e } = await local.from(table).upsert(record, {
        onConflict: "id",
      });
      if (e) error = e.message;
    } else if (type === "DELETE") {
      operation = "delete";
      const { error: e } = await local.from(table).delete().eq("id", registroId);
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
    direccion: "receive",
    tabla: table,
    registro_id: registroId || null,
    operacion: operation!,
    estado: error ? "error" : "ok",
    mensaje_error: error,
    payload: { type, record, old_record: oldRecord },
  });

  if (error) {
    console.error("sync-receive error:", table, error);
    return json({ ok: false, error }, 500);
  }
  return json({ ok: true, table, operation });
});
