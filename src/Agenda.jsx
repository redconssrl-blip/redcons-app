import { useState, useEffect } from "react";
import { db, pedirTokenPush } from "./firebase.js";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc,
} from "firebase/firestore";
import { Plus, Trash2, Bell, BellOff, MapPin, User, Calendar } from "lucide-react";

const EMPTY_ITEM = { tipo: "trabajo", fecha: "", cliente: "", lugar: "", notas: "" };

export default function Agenda() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [pushEstado, setPushEstado] = useState("inicial");

  useEffect(() => {
    const q = query(collection(db, "agenda"), orderBy("fecha", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  async function activarNotificaciones() {
    setPushEstado("activando");
    const token = await pedirTokenPush();
    if (!token) {
      setPushEstado(Notification?.permission === "denied" ? "rechazado" : "no_soportado");
      return;
    }
    await setDoc(doc(db, "agenda_tokens", token), {
      token,
      actualizado: new Date().toISOString(),
    });
    setPushEstado("activo");
  }

  async function agregarItem(e) {
    e.preventDefault();
    if (!form.fecha || !form.cliente) return;
    await addDoc(collection(db, "agenda"), { ...form, creado: new Date().toISOString() });
    setForm(EMPTY_ITEM);
  }

  async function borrarItem(id) {
    await deleteDoc(doc(db, "agenda", id));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {pushEstado === "activo" ? (
            <Bell size={16} className="text-[#a8e6b8]" />
          ) : (
            <BellOff size={16} className="text-[#8fae9c]" />
          )}
          <p className="ff-body text-xs text-[#8fae9c]">
            {pushEstado === "activo" && "Notificaciones activadas en este dispositivo."}
            {pushEstado === "inicial" && "Activá los avisos para recibir un push un día antes de cada trabajo."}
            {pushEstado === "activando" && "Activando..."}
            {pushEstado === "rechazado" && "Bloqueaste las notificaciones. Habilitalas desde la configuración del sitio en Chrome."}
            {pushEstado === "no_soportado" && "Este navegador no soporta notificaciones push."}
          </p>
        </div>
        {pushEstado !== "activo" && pushEstado !== "activando" && (
          <button onClick={activarNotificaciones}
            className="ff-mono text-xs px-3 py-1.5 rounded-md bg-[#8fae9c] text-[#16201c] whitespace-nowrap">
            Activar avisos
          </button>
        )}
      </div>

      <form onSubmit={agregarItem} className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4 space-y-3">
        <div className="flex gap-2">
          {["trabajo", "tramite"].map((t) => (
            <button key={t} type="button" onClick={() => setForm({ ...form, tipo: t })}
              className={`ff-mono text-xs px-3 py-1.5 rounded-md border ${form.tipo === t ? "bg-[#8fae9c] text-[#16201c] border-[#8fae9c]" : "border-[#3a4a42] text-[#8fae9c]"}`}>
              {t === "trabajo" ? "Trabajo" : "Trámite"}
            </button>
          ))}
        </div>
        <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          className="w-full bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 ff-body text-sm text-[#f4ead0]" required />
        <input placeholder="Cliente" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })}
          className="w-full bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 ff-body text-sm text-[#f4ead0]" required />
        <input placeholder="Lugar" value={form.lugar} onChange={(e) => setForm({ ...form, lugar: e.target.value })}
          className="w-full bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 ff-body text-sm text-[#f4ead0]" />
        <input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
          className="w-full bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 ff-body text-sm text-[#f4ead0]" />
        <button type="submit" className="flex items-center gap-1.5 ff-mono text-xs px-3 py-2 rounded-md bg-[#8fae9c] text-[#16201c]">
          <Plus size={14} /> Agregar a la agenda
        </button>
      </form>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="ff-body text-xs text-[#5a6b62]">Todavía no hay nada cargado en la agenda.</p>
        )}
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-3 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`ff-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${it.tipo === "trabajo" ? "bg-[#8fae9c] text-[#16201c]" : "bg-[#e0b56f] text-[#16201c]"}`}>
                  {it.tipo === "trabajo" ? "Trabajo" : "Trámite"}
                </span>
                <span className="flex items-center gap-1 ff-mono text-xs text-[#8fae9c]">
                  <Calendar size={12} /> {it.fecha}
                </span>
              </div>
              <p className="ff-body text-sm text-[#f4ead0] flex items-center gap-1">
                <User size={13} className="text-[#8fae9c]" /> {it.cliente}
              </p>
              {it.lugar && (
                <p className="ff-body text-xs text-[#8fae9c] flex items-center gap-1">
                  <MapPin size={12} /> {it.lugar}
                </p>
              )}
              {it.notas && <p className="ff-body text-xs text-[#5a6b62]">{it.notas}</p>}
            </div>
            <button onClick={() => borrarItem(it.id)} className="text-[#e08a6f]">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
