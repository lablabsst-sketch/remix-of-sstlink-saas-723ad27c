import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  GraduationCap, Plus, Pencil, Trash2, Users,
  Clock, CheckCircle2, BookOpen, ChevronRight, UserCheck, UserX,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Capacitacion {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  tipo: string | null;
  duracion_horas: number | null;
  responsable: string | null;
  estado: string;
  created_at: string;
}

interface Trabajador {
  id: string;
  nombres: string;
  apellidos: string;
  cargo: string | null;
}

interface Asistencia {
  id: string;
  capacitacion_id: string;
  trabajador_id: string;
  empresa_id: string;
  asistio: boolean | null;
  nota: number | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPOS = [
  "Inducción", "Seguridad vial", "Trabajo en alturas", "Espacios confinados",
  "Riesgo eléctrico", "Primeros auxilios", "Manejo de sustancias", "Incendios y evacuación",
  "Riesgo biológico", "Ergonomía", "Salud mental", "SG-SST general", "Otro",
];

const ESTADOS: Record<string, string> = {
  programada: "Programada",
  en_progreso: "En progreso",
  completada: "Completada",
  cancelada: "Cancelada",
};

const ESTADO_BADGE: Record<string, string> = {
  programada:  "bg-blue-100 text-blue-800",
  en_progreso: "bg-yellow-100 text-yellow-800",
  completada:  "bg-green-100 text-green-800",
  cancelada:   "bg-gray-100 text-gray-600",
};

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = [
  { value: "all", label: "Todos los meses" },
  { value: "1", label: "Enero" }, { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" }, { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" }, { value: "6", label: "Junio" },
  { value: "7", label: "Julio" }, { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" }, { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" }, { value: "12", label: "Diciembre" },
];

const emptyForm = {
  titulo: "",
  descripcion: "",
  fecha: new Date().toISOString().slice(0, 10),
  tipo: "SG-SST general",
  duracion_horas: 1,
  responsable: "",
  estado: "programada",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Capacitaciones() {
  const { empresa } = useAuth();
  const { toast } = useToast();

  // Data
  const [caps, setCaps] = useState<Capacitacion[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterEstado, setFilterEstado] = useState("all");

  // Create/edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Capacitacion | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Attendance dialog
  const [asistenciaOpen, setAsistenciaOpen] = useState(false);
  const [selectedCap, setSelectedCap] = useState<Capacitacion | null>(null);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [loadingAsis, setLoadingAsis] = useState(false);
  const [savingAsis, setSavingAsis] = useState<string | null>(null);
  // Local attendance state: trabajador_id -> { asistio, nota }
  const [asisMap, setAsisMap] = useState<Record<string, { asistio: boolean; nota: string; id?: string }>>({});

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    const [{ data: cs }, { data: ts }] = await Promise.all([
      (supabase as any)
        .from("capacitaciones")
        .select("*")
        .eq("empresa_id", empresa.id)
        .order("fecha", { ascending: false }),
      supabase
        .from("trabajadores")
        .select("id, nombres, apellidos, cargo")
        .eq("empresa_id", empresa.id)
        .eq("estado", "activo"),
    ]);
    setCaps(cs ?? []);
    setTrabajadores(ts ?? []);
    setLoading(false);
  }, [empresa?.id]);

  useEffect(() => { if (empresa?.id) fetchAll(); }, [empresa?.id, fetchAll]);

  // ─── Filters ───────────────────────────────────────────────────────────────

  const filtered = caps.filter((c) => {
    const d = new Date(c.fecha);
    return (
      String(d.getFullYear()) === filterYear &&
      (filterMonth === "all" || String(d.getMonth() + 1) === filterMonth) &&
      (filterEstado === "all" || c.estado === filterEstado)
    );
  });

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  const total = filtered.length;
  const completadas = filtered.filter((c) => c.estado === "completada").length;
  const horasTotales = filtered.reduce((s, c) => s + (c.duracion_horas ?? 0), 0);

  // ─── Create / Edit ─────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (c: Capacitacion) => {
    setEditing(c);
    setForm({
      titulo: c.titulo,
      descripcion: c.descripcion ?? "",
      fecha: c.fecha,
      tipo: c.tipo ?? "SG-SST general",
      duracion_horas: c.duracion_horas ?? 1,
      responsable: c.responsable ?? "",
      estado: c.estado,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!empresa?.id || !form.titulo || !form.fecha) return;
    setSaving(true);
    const payload = {
      empresa_id: empresa.id,
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      fecha: form.fecha,
      tipo: form.tipo || null,
      duracion_horas: form.duracion_horas,
      responsable: form.responsable || null,
      estado: form.estado,
    };
    if (editing) {
      const { error } = await (supabase as any).from("capacitaciones").update(payload).eq("id", editing.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { toast({ title: "Capacitación actualizada" }); setFormOpen(false); fetchAll(); }
    } else {
      const { error } = await (supabase as any).from("capacitaciones").insert(payload);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { toast({ title: "Capacitación creada" }); setFormOpen(false); fetchAll(); }
    }
    setSaving(false);
  };

  // ─── Delete ────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteId) return;
    await (supabase as any).from("capacitaciones").delete().eq("id", deleteId);
    toast({ title: "Capacitación eliminada" });
    setDeleteId(null);
    fetchAll();
  };

  // ─── Attendance ────────────────────────────────────────────────────────────

  const openAsistencia = async (cap: Capacitacion) => {
    setSelectedCap(cap);
    setAsistenciaOpen(true);
    setLoadingAsis(true);

    const { data } = await (supabase as any)
      .from("asistencia_capacitacion")
      .select("*")
      .eq("capacitacion_id", cap.id);

    setAsistencias(data ?? []);

    // Build asisMap from existing records
    const map: Record<string, { asistio: boolean; nota: string; id?: string }> = {};
    // Initialize all workers as "not marked"
    trabajadores.forEach((t) => {
      map[t.id] = { asistio: false, nota: "" };
    });
    // Overlay existing attendance
    (data ?? []).forEach((a: Asistencia) => {
      map[a.trabajador_id] = { asistio: a.asistio ?? false, nota: String(a.nota ?? ""), id: a.id };
    });
    setAsisMap(map);
    setLoadingAsis(false);
  };

  const toggleAsistio = (trabajadorId: string, value: boolean) => {
    setAsisMap((prev) => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], asistio: value } }));
  };

  const setNota = (trabajadorId: string, value: string) => {
    setAsisMap((prev) => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], nota: value } }));
  };

  const saveAsistencia = async () => {
    if (!empresa?.id || !selectedCap) return;
    setSavingAsis("saving");

    const entries = Object.entries(asisMap);
    for (const [trabajadorId, { asistio, nota, id }] of entries) {
      const payload = {
        capacitacion_id: selectedCap.id,
        trabajador_id: trabajadorId,
        empresa_id: empresa.id,
        asistio,
        nota: nota !== "" ? parseFloat(nota) : null,
      };
      if (id) {
        await (supabase as any).from("asistencia_capacitacion").update(payload).eq("id", id);
      } else {
        await (supabase as any).from("asistencia_capacitacion").insert(payload);
      }
    }

    toast({ title: "Asistencia guardada" });
    setSavingAsis(null);
    setAsistenciaOpen(false);
    fetchAll();
  };

  // Count attendance for a given capacitacion
  const getAsistenciaCount = (capId: string) => {
    // We don't have per-cap asistencia loaded in the list — show "—" until opened
    return null;
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout breadcrumbs={["SSTLink", "Capacitaciones"]}>
      <div className="space-y-4 max-w-6xl">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-500" />
              Capacitaciones
            </h1>
            <p className="text-sm text-muted-foreground">Programa, registra y controla la asistencia del equipo</p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />Nueva capacitación
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {loading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />) : (
            <>
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-lg bg-indigo-100 p-2"><BookOpen className="h-4 w-4 text-indigo-600" /></div>
                <div><p className="text-xl font-bold">{total}</p><p className="text-xs text-muted-foreground">Total capacitaciones</p></div>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2"><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
                <div><p className="text-xl font-bold">{completadas}</p><p className="text-xs text-muted-foreground">Completadas</p></div>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2"><Clock className="h-4 w-4 text-blue-600" /></div>
                <div><p className="text-xl font-bold">{horasTotales}h</p><p className="text-xs text-muted-foreground">Horas de formación</p></div>
              </CardContent></Card>
            </>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(ESTADOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <GraduationCap className="mx-auto h-9 w-9 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No hay capacitaciones registradas</p>
                <p className="text-xs text-muted-foreground">Haz clic en "Nueva capacitación" para empezar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Duración</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => openAsistencia(c)}
                      >
                        <TableCell className="font-medium text-sm">
                          <span className="flex items-center gap-1">
                            {c.titulo}
                            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.tipo ?? "—"}</TableCell>
                        <TableCell className="text-sm">{new Date(c.fecha + "T12:00:00").toLocaleDateString("es-CO")}</TableCell>
                        <TableCell className="text-sm">{c.duracion_horas ? `${c.duracion_horas}h` : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.responsable ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_BADGE[c.estado] ?? "bg-gray-100 text-gray-700"}`}>
                            {ESTADOS[c.estado] ?? c.estado}
                          </span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar capacitación" : "Nueva capacitación"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Trabajo seguro en alturas" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ESTADOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Duración (horas)</Label>
                <Input type="number" min={0.5} step={0.5} value={form.duracion_horas} onChange={(e) => setForm({ ...form, duracion_horas: parseFloat(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsable / Instructor</Label>
              <Input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} placeholder="Nombre del instructor o área responsable" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} placeholder="Temas cubiertos, objetivos, lugar…" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" size="sm">Cancelar</Button></DialogClose>
            <Button size="sm" onClick={save} disabled={saving || !form.titulo || !form.fecha}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Attendance Dialog ────────────────────────────────────────────────── */}
      <Dialog open={asistenciaOpen} onOpenChange={setAsistenciaOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              Asistencia — {selectedCap?.titulo}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {selectedCap?.fecha && new Date(selectedCap.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              {selectedCap?.duracion_horas && ` · ${selectedCap.duracion_horas}h`}
            </p>
          </DialogHeader>

          {loadingAsis ? (
            <div className="space-y-2 py-4">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : trabajadores.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No hay trabajadores activos registrados.
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto">
              {/* Summary */}
              <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <UserCheck className="h-3.5 w-3.5 text-green-500" />
                  {Object.values(asisMap).filter((a) => a.asistio).length} asistieron
                </span>
                <span className="flex items-center gap-1">
                  <UserX className="h-3.5 w-3.5 text-red-400" />
                  {Object.values(asisMap).filter((a) => !a.asistio).length} no asistieron
                </span>
                <span>de {trabajadores.length} trabajadores</span>
              </div>

              <div className="space-y-1">
                {trabajadores.map((t) => {
                  const entry = asisMap[t.id] ?? { asistio: false, nota: "" };
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                        entry.asistio ? "bg-green-50 border-green-200" : "bg-background border-border"
                      }`}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-[11px] bg-muted">
                          {`${t.nombres[0]}${t.apellidos[0]}`.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.nombres} {t.apellidos}</p>
                        {t.cargo && <p className="text-[10px] text-muted-foreground">{t.cargo}</p>}
                      </div>
                      {/* Nota */}
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        placeholder="Nota"
                        className="w-20 h-7 text-xs text-center"
                        value={entry.nota}
                        onChange={(e) => setNota(t.id, e.target.value)}
                      />
                      {/* Asistió switch */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">Asistió</span>
                        <Switch
                          checked={entry.asistio}
                          onCheckedChange={(v) => toggleAsistio(t.id, v)}
                          className="scale-90"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="outline" size="sm">Cerrar</Button></DialogClose>
            <Button size="sm" onClick={saveAsistencia} disabled={savingAsis === "saving" || loadingAsis}>
              {savingAsis === "saving" ? "Guardando…" : "Guardar asistencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete ───────────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar capacitación?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán también los registros de asistencia. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
