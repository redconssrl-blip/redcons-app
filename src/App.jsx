import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "./firebase.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import {
  Plus, Trash2, MapPin, Calendar, DollarSign, User, Search,
  Camera, X, Download, Wrench, Truck, Phone, FileText, ChevronLeft,
  Users, ClipboardList, Layers, Mail, Lock, Unlock, Settings, EyeOff, HardHat, Pencil, CheckCircle2,
} from "lucide-react";

const TIPOS_TRABAJO = ["Movimiento de suelo", "Excavación", "Demolición", "Nivelación", "Venta de áridos", "Otro"];
const MAQUINAS = ["Bobcat", "Bobcat c/martillo", "Bobcat c/rollo", "Fresadora", "Retroexcavadora", "Miniexcavadora", "Camión"];
const ARIDOS = [
  "Arena Gruesa", "Arena Fina", "Grancilla 1,3", "Material 020",
  "Triturado 1,2", "Triturado 1,3", "Polvo de piedra", "Tierra Negra", "Tierra común",
];
const ESTADOS_PAGO = { pagado: "Pagado", parcial: "Pago parcial", pendiente: "Pendiente" };
const ESTADOS_PAGO_EMOJI = { pagado: "🟢 Pagado", parcial: "🟡 Pago parcial", pendiente: "🔴 Pendiente" };
const colorEstado = { pagado: "#22c55e", parcial: "#eab308", pendiente: "#ef4444" };
const IVA = 0.21;
const MASTER_PIN = "419930188";

const EMPTY_CLIENTE = { nombre: "", telefono: "", email: "", direccion: "" };
const EMPTY_ARIDO_LINEA = { arido: ARIDOS[0], m3: "" };
const EMPTY_MAQUINA_LINEA = { maquina: MAQUINAS[0], operador: "", costo: "", costoViaje: "", cantViajes: "" };
const EMPTY_TRABAJO = {
  clienteId: "", fecha: "", lugar: "", trabajo: "", tipo: TIPOS_TRABAJO[0],
  maquinas: [{ ...EMPTY_MAQUINA_LINEA }], aridos: [{ ...EMPTY_ARIDO_LINEA }], remito: "",
  estadoTrabajo: "realizado", costo: "", pago: "", conIva: false, foto: null,
};
const EMPTY_PRECIOS = ARIDOS.reduce((acc, a) => ({ ...acc, [a]: { m3: "", viaje: "" } }), {});

function resizeImage(file, maxSize = 700) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
        else if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function totalACobrar(costo, conIva) {
  const base = Number(costo || 0);
  return conIva ? Math.round(base * (1 + IVA)) : base;
}

function estadoPago(costo, pago, conIva) {
  const c = totalACobrar(costo, conIva), p = Number(pago || 0);
  if (p <= 0) return "pendiente";
  if (p >= c) return "pagado";
  return "parcial";
}

function calcularCostoArido(precios, arido, m3) {
  const p = precios[arido];
  if (!p || !m3) return "";
  const cant = Number(m3);
  const base = Number(p.m3 || 0) * cant;
  const viaje = cant < 6 ? Number(p.viaje || 0) : 0;
  return String(Math.round(base + viaje));
}

function calcularCostoTotalMaquinas(lineas) {
  const total = (lineas || []).reduce((s, l) => {
    const costo = Number(l.costo || 0);
    const viaje = l.maquina === "Camión" ? Number(l.costoViaje || 0) * Number(l.cantViajes || 0) : 0;
    return s + costo + viaje;
  }, 0);
  return total > 0 ? String(total) : "";
}

function calcularCostoTotalAridos(precios, lineas) {
  const total = (lineas || []).reduce((s, l) => s + Number(calcularCostoArido(precios, l.arido, l.m3) || 0), 0);
  return total > 0 ? String(total) : "";
}

export default function RedconsApp() {
  const [clientes, setClientes] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [precios, setPrecios] = useState(EMPTY_PRECIOS);
  const [adminPin, setAdminPin] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState("trabajos");
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);

  const [formCliente, setFormCliente] = useState(EMPTY_CLIENTE);
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false);
  const [formTrabajo, setFormTrabajo] = useState(EMPTY_TRABAJO);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [buscaTrabajo, setBuscaTrabajo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [errorPin, setErrorPin] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "redcons", "datos"));
        if (snap.exists()) {
          const d = snap.data();
          if (d.clientes) setClientes(JSON.parse(d.clientes));
          if (d.trabajos) setTrabajos(JSON.parse(d.trabajos));
          if (d.precios) setPrecios(JSON.parse(d.precios));
          if (d.admin_pin) setAdminPin(d.admin_pin);
        }
      } catch (e) { console.error("Error cargando datos:", e); }
      setLoading(false);
    })();
  }, []);

  async function guardarEnFirebase(campo, valor) {
    try {
      await setDoc(doc(db, "redcons", "datos"), { [campo]: valor }, { merge: true });
    } catch (e) { console.error("Error guardando:", e); }
  }

  async function guardarClientes(n) { setClientes(n); await guardarEnFirebase("clientes", JSON.stringify(n)); }
  async function guardarTrabajos(n) { setTrabajos(n); await guardarEnFirebase("trabajos", JSON.stringify(n)); }
  async function guardarPrecios(n) { setPrecios(n); await guardarEnFirebase("precios", JSON.stringify(n)); }
  async function guardarPin(pin) {
    setAdminPin(pin);
    try {
      await guardarEnFirebase("admin_pin", pin);
      return true;
    } catch (e) {
      return false;
    }
  }

  function intentarLogin() {
    if (pinInput === MASTER_PIN) { setEsAdmin(true); setMostrarLogin(false); setPinInput(""); setErrorPin(""); return; }
    if (!adminPin) { setErrorPin("Todavía no hay PIN configurado. Pedíselo al administrador."); return; }
    if (pinInput === adminPin) { setEsAdmin(true); setMostrarLogin(false); setPinInput(""); setErrorPin(""); }
    else setErrorPin("PIN incorrecto");
  }

  function cerrarSesion() { setEsAdmin(false); }

  async function cambiarPin(nuevo) {
    if (!nuevo || nuevo.length < 4) return false;
    return await guardarPin(nuevo);
  }

  function crearCliente() {
    if (!formCliente.nombre.trim()) return;
    const numero = clientes.length ? Math.max(...clientes.map((c) => c.numero)) + 1 : 1;
    const nuevo = { ...formCliente, id: Date.now().toString(), numero };
    guardarClientes([...clientes, nuevo]);
    setFormCliente(EMPTY_CLIENTE);
    setMostrarFormCliente(false);
  }

  function eliminarCliente(id) {
    if (!esAdmin) return;
    guardarClientes(clientes.filter((c) => c.id !== id));
    guardarTrabajos(trabajos.filter((t) => t.clienteId !== id));
    if (clienteSeleccionado?.id === id) { setClienteSeleccionado(null); setVista("clientes"); }
  }

  async function manejarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file);
    setFormTrabajo({ ...formTrabajo, foto: dataUrl });
  }

  function agregarTrabajo() {
    if (!formTrabajo.clienteId || !formTrabajo.fecha) return;
    const datos = {
      ...formTrabajo,
      costo: formTrabajo.costo ? Number(formTrabajo.costo) : 0,
      pago: formTrabajo.pago ? Number(formTrabajo.pago) : 0,
    };
    if (editandoId) {
      guardarTrabajos(trabajos.map((t) => (t.id === editandoId ? { ...datos, id: editandoId } : t)));
      setEditandoId(null);
    } else {
      guardarTrabajos([{ ...datos, id: Date.now().toString() }, ...trabajos]);
    }
    setFormTrabajo({ ...EMPTY_TRABAJO, clienteId: formTrabajo.clienteId });
  }

  function editarTrabajo(t) {
    if (!esAdmin) return;
    const aridos = t.aridos && t.aridos.length ? t.aridos : (t.arido ? [{ arido: t.arido, m3: t.m3 || "" }] : [{ ...EMPTY_ARIDO_LINEA }]);
    const maquinas = t.maquinas && t.maquinas.length ? t.maquinas : (t.maquina ? [{ maquina: t.maquina, operador: t.operador || "", costo: "", costoViaje: "", cantViajes: "" }] : [{ ...EMPTY_MAQUINA_LINEA }]);
    setFormTrabajo({ ...EMPTY_TRABAJO, ...t, aridos, maquinas, estadoTrabajo: t.estadoTrabajo || "realizado", costo: String(t.costo ?? ""), pago: String(t.pago ?? "") });
    setEditandoId(t.id);
    setVista("trabajos");
    setClienteSeleccionado(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setFormTrabajo(EMPTY_TRABAJO);
  }

  function eliminarTrabajo(id) { if (esAdmin) guardarTrabajos(trabajos.filter((t) => t.id !== id)); }

  function actualizarRemito(id, remito) {
    guardarTrabajos(trabajos.map((t) => (t.id === id ? { ...t, remito } : t)));
  }

  function marcarRealizado(id) {
    guardarTrabajos(trabajos.map((t) => (t.id === id ? { ...t, estadoTrabajo: "realizado" } : t)));
  }

  function nombreCliente(id) {
    const c = clientes.find((c) => c.id === id);
    return c ? `#${c.numero} ${c.nombre}` : "Cliente eliminado";
  }

  const clientesFiltrados = useMemo(() => {
    const q = buscaCliente.toLowerCase();
    return clientes
      .filter((c) => c.nombre.toLowerCase().includes(q) || String(c.numero).includes(q) || (c.telefono || "").includes(q))
      .sort((a, b) => a.numero - b.numero);
  }, [clientes, buscaCliente]);

  const trabajosDeCliente = (id) =>
    trabajos
      .filter((t) => t.clienteId === id)
      .filter((t) => (esAdmin ? true : t.estadoTrabajo === "agendado"))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const trabajosFiltrados = useMemo(() => {
    const q = buscaTrabajo.toLowerCase();
    return trabajos
      .filter((t) => (esAdmin ? true : t.estadoTrabajo === "agendado"))
      .filter((t) => {
        const nombre = nombreCliente(t.clienteId).toLowerCase();
        return nombre.includes(q) || t.lugar.toLowerCase().includes(q) || t.trabajo.toLowerCase().includes(q) || (t.remito || "").toLowerCase().includes(q);
      })
      .filter((t) => (filtroEstado === "todos" ? true : estadoPago(t.costo, t.pago, t.conIva) === filtroEstado))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [trabajos, buscaTrabajo, filtroEstado, clientes, esAdmin]);

  const totales = useMemo(() => {
    const costo = trabajos.reduce((s, t) => s + totalACobrar(t.costo, t.conIva), 0);
    const pagado = trabajos.reduce((s, t) => s + Number(t.pago || 0), 0);
    return { costo, pagado, saldo: costo - pagado };
  }, [trabajos]);

  function filaTrabajo(t, cli) {
    const maquinasLista = t.maquinas && t.maquinas.length ? t.maquinas : (t.maquina ? [{ maquina: t.maquina, operador: t.operador || "", costo: t.costo, costoViaje: "" }] : []);
    const detalleCostos = t.tipo === "Venta de áridos" ? "" :
      maquinasLista.map((l) => `${l.maquina}: $${Number(l.costo || 0).toLocaleString("es-AR")}${l.maquina === "Camión" && l.costoViaje ? ` + ${l.cantViajes || 0} viaje(s) x $${Number(l.costoViaje || 0).toLocaleString("es-AR")} = $${(Number(l.costoViaje || 0) * Number(l.cantViajes || 0)).toLocaleString("es-AR")}` : ""}`).join(" | ");
    return {
      "N° Cliente": cli?.numero ?? "", Cliente: cli?.nombre ?? "Eliminado", Teléfono: cli?.telefono ?? "",
      Email: cli?.email ?? "", "Dirección cliente": cli?.direccion ?? "",
      Fecha: t.fecha, "Dirección trabajo": t.lugar, Tipo: t.tipo,
      "Estado trabajo": t.estadoTrabajo === "agendado" ? "Agendado" : "Realizado",
      Maquinaria: t.tipo === "Venta de áridos" ? "-" : maquinasLista.map((l) => l.maquina).join(", "),
      Operador: t.tipo === "Venta de áridos" ? "-" : maquinasLista.map((l) => l.operador).filter(Boolean).join(", "),
      "Detalle costos maquinaria": detalleCostos,
      Árido: t.tipo === "Venta de áridos" ? (t.aridos && t.aridos.length ? t.aridos.map((l) => l.arido).join(", ") : (t.arido || "")) : "-",
      "M³": t.tipo === "Venta de áridos" ? (t.aridos && t.aridos.length ? t.aridos.map((l) => l.m3).join(", ") : (t.m3 || "")) : "",
      Trabajo: t.trabajo, Remito: t.remito,
      "Costo sin IVA ($)": Number(t.costo || 0),
      "Costo con IVA ($)": t.conIva ? Math.round(Number(t.costo || 0) * (1 + IVA)) : Number(t.costo || 0),
      "Pagado ($)": Number(t.pago || 0),
      "Saldo ($)": totalACobrar(t.costo, t.conIva) - Number(t.pago || 0),
      Estado: ESTADOS_PAGO_EMOJI[estadoPago(t.costo, t.pago, t.conIva)],
    };
  }

  function nombreHojaUnico(nombreBase, usados) {
    let limpio = nombreBase.replace(/[\\/?*[\]:]/g, "").slice(0, 28).trim() || "Cliente";
    let nombre = limpio, i = 2;
    while (usados.has(nombre.toLowerCase())) { nombre = `${limpio} (${i})`; i++; }
    usados.add(nombre.toLowerCase());
    return nombre;
  }

  function exportarExcel() {
    if (!esAdmin) return;
    const wb = XLSX.utils.book_new();

    // Hoja "Datos": tabla plana, fuente para las fórmulas del buscador
    const cabecera = [
      "N° Cliente", "Cliente", "Teléfono", "Email", "Dirección cliente",
      "Fecha", "Dirección trabajo", "Tipo", "Estado trabajo", "Maquinaria", "Operador",
      "Detalle costos maquinaria", "Árido", "M³", "Trabajo", "Remito",
      "Costo sin IVA", "Costo con IVA", "Pagado", "Saldo", "Estado",
    ];
    const filasDatos = trabajos.map((t) => {
      const cli = clientes.find((c) => c.id === t.clienteId);
      const f = filaTrabajo(t, cli);
      return [
        f["N° Cliente"], f["Cliente"], f["Teléfono"], f["Email"], f["Dirección cliente"],
        f["Fecha"], f["Dirección trabajo"], f["Tipo"], f["Estado trabajo"], f["Maquinaria"], f["Operador"],
        f["Detalle costos maquinaria"], f["Árido"], f["M³"], f["Trabajo"], f["Remito"],
        f["Costo sin IVA ($)"], f["Costo con IVA ($)"], f["Pagado ($)"], f["Saldo ($)"], f["Estado"],
      ];
    });
    const wsDatos = XLSX.utils.aoa_to_sheet([cabecera, ...filasDatos]);
    wsDatos["!cols"] = Array(cabecera.length).fill({ wch: 14 });
    XLSX.utils.book_append_sheet(wb, wsDatos, "Datos");

    const ultimaFilaDatos = filasDatos.length + 1; // fila 1 es cabecera

    const filaIni = 2;
    const filaFin = ultimaFilaDatos > 1 ? ultimaFilaDatos : 2;
    const r = (col) => `Datos!${col}${filaIni}:${col}${filaFin}`;

    // Hoja "Buscador": poné un N° de cliente en B3 y se completa todo solo
    const primerCliente = filasDatos.length ? filasDatos[0][0] : "";
    const aoaBuscador = [
      ["BUSCADOR DE CLIENTES", "", "", "", "", "", "", "", ""],
      [],
      ["N° Cliente:", primerCliente, "", "Nombre del Cliente:", "", "", "", "", ""],
      ["(Podés buscar por N°; el nombre se completa solo)", "", "", "", "", "", "", "", ""],
      [],
      ["Teléfono:", "", "", "", "", "", "", "", ""],
      ["Total Trabajos:", "", "", "", "", "", "", "", ""],
      ["Valor Total:", "", "", "", "", "", "", "", ""],
      ["Total Pagado:", "", "", "", "", "", "", "", ""],
      ["Saldo Pendiente Total:", "", "", "", "", "", "", "", ""],
      [],
      ["HISTORIAL DE TRABAJOS (solo trabajos realizados)", "", "", "", "", "", "", "", ""],
      ["Lugar de Trabajo", "Trabajo Realizado", "Maquinaria / Árido", "Remito", "Fecha", "Valor Trabajo", "Pago Realizado", "Saldo", "Estado pago"],
    ];
    const wsBuscador = XLSX.utils.aoa_to_sheet(aoaBuscador);

    // Columnas en Datos: A N°Cliente, B Cliente, C Teléfono, F Fecha, G Dirección trabajo,
    // I Estado trabajo, J Maquinaria, M Árido, O Trabajo, P Remito, R CostoConIVA, S Pagado, T Saldo, U Estado pago
    wsBuscador["E3"] = { t: "str", f: `IFERROR(VLOOKUP($B$3,Datos!A${filaIni}:B${filaFin},2,0),"No encontrado")` };
    wsBuscador["B6"] = { t: "str", f: `IFERROR(VLOOKUP($B$3,Datos!A${filaIni}:C${filaFin},3,0),"")` };
    wsBuscador["B7"] = { t: "n", f: `COUNTIFS(${r("A")},$B$3,${r("I")},"Realizado")` };
    wsBuscador["B8"] = { t: "n", f: `SUMIFS(${r("R")},${r("A")},$B$3,${r("I")},"Realizado")` };
    wsBuscador["B9"] = { t: "n", f: `SUMIFS(${r("S")},${r("A")},$B$3,${r("I")},"Realizado")` };
    wsBuscador["B10"] = { t: "n", f: `B8-B9` };

    // Usamos SMALL + IF como fórmula matricial (compatible con Excel desde versiones muy viejas, 2003/2007 en adelante).
    const filaInicio = 14;
    const FIN = 1000; // rango fijo amplio en la hoja Datos, por si suman más trabajos a futuro
    const condNum = `(Datos!$A$2:$A$${FIN}=$B$3)*(Datos!$I$2:$I$${FIN}="Realizado")`;
    const maxFilas = Math.max(filasDatos.length, 15);

    for (let k = 1; k <= maxFilas; k++) {
      const fila = filaInicio + k - 1;
      // Columna K (oculta): índice de fila dentro de Datos que corresponde a la k-ésima coincidencia.
      // Marcada como fórmula matricial (propiedad F) para que funcione sin tener que apretar Ctrl+Shift+Enter.
      wsBuscador[`K${fila}`] = {
        t: "n",
        f: `IFERROR(SMALL(IF(${condNum},ROW(Datos!$A$2:$A$${FIN})-1),${k}),"")`,
        F: `K${fila}`,
      };
      const idx = `$K${fila}`;
      wsBuscador[`A${fila}`] = { t: "str", f: `IFERROR(INDEX(Datos!$G$2:$G$${FIN},${idx}),"")` };
      wsBuscador[`B${fila}`] = { t: "str", f: `IFERROR(INDEX(Datos!$O$2:$O$${FIN},${idx}),"")` };
      wsBuscador[`C${fila}`] = { t: "str", f: `IFERROR(INDEX(Datos!$J$2:$J$${FIN},${idx})&" "&INDEX(Datos!$M$2:$M$${FIN},${idx}),"")` };
      wsBuscador[`D${fila}`] = { t: "str", f: `IFERROR(INDEX(Datos!$P$2:$P$${FIN},${idx}),"")` };
      wsBuscador[`E${fila}`] = { t: "str", f: `IFERROR(INDEX(Datos!$F$2:$F$${FIN},${idx}),"")` };
      wsBuscador[`F${fila}`] = { t: "n", f: `IFERROR(INDEX(Datos!$R$2:$R$${FIN},${idx}),0)` };
      wsBuscador[`G${fila}`] = { t: "n", f: `IFERROR(INDEX(Datos!$S$2:$S$${FIN},${idx}),0)` };
      wsBuscador[`H${fila}`] = { t: "n", f: `IFERROR(INDEX(Datos!$T$2:$T$${FIN},${idx}),0)` };
      wsBuscador[`I${fila}`] = { t: "str", f: `IFERROR(INDEX(Datos!$U$2:$U$${FIN},${idx}),"")` };
    }

    wsBuscador["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 6, hidden: true }];
    wsBuscador["!ref"] = `A1:K${filaInicio + maxFilas}`;
    XLSX.utils.book_append_sheet(wb, wsBuscador, "Buscador");
    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }], activeTab: 1 };

    XLSX.writeFile(wb, `redcons_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#16201c] flex items-center justify-center"><p className="text-[#d9cba8] font-mono text-sm">cargando...</p></div>;
  }

  const Tab = ({ id, icon: Icon, label }) => (
    <button onClick={() => { setVista(id); setClienteSeleccionado(null); }}
      className={`flex items-center gap-1.5 ff-mono text-xs px-3 py-2 rounded-md border transition-colors ${vista === id ? "bg-[#8fae9c] text-[#16201c] border-[#8fae9c]" : "border-[#3a4a42] text-[#8fae9c] hover:border-[#8fae9c]"}`}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#16201c] text-[#ece4cf]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        .ff-display { font-family: 'Fraunces', serif; }
        .ff-mono { font-family: 'JetBrains Mono', monospace; }
        .ff-body { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="max-w-3xl mx-auto px-5 py-10">
        <header className="mb-6 flex items-end justify-between border-b border-[#3a4a42] pb-5">
          <div>
            <p className="ff-mono text-[11px] tracking-[0.25em] text-[#8fae9c] uppercase mb-1">redcons</p>
            <h1 className="ff-display text-4xl font-semibold text-[#f4ead0]">Movimientos de suelo</h1>
          </div>
          <div className="flex gap-2">
            {esAdmin && (
              <button onClick={exportarExcel} disabled={trabajos.length === 0}
                className="flex items-center gap-2 ff-mono text-xs px-3 py-2 rounded-md border border-[#3a4a42] text-[#8fae9c] hover:border-[#8fae9c] disabled:opacity-30 transition-colors">
                <Download size={14} /> Excel
              </button>
            )}
            <button onClick={() => (esAdmin ? cerrarSesion() : setMostrarLogin(true))}
              className={`flex items-center gap-2 ff-mono text-xs px-3 py-2 rounded-md border transition-colors ${esAdmin ? "bg-[#8fae9c] text-[#16201c] border-[#8fae9c]" : "border-[#3a4a42] text-[#8fae9c] hover:border-[#8fae9c]"}`}>
              {esAdmin ? <Unlock size={14} /> : <Lock size={14} />} {esAdmin ? "Admin" : "Ingresar"}
            </button>
          </div>
        </header>

        {mostrarLogin && (
          <div onClick={() => setMostrarLogin(false)} className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
            <div onClick={(e) => e.stopPropagation()} className="bg-[#1c2722] border border-[#3a4a42] rounded-lg p-6 w-full max-w-sm">
              <p className="ff-display text-xl text-[#f4ead0] mb-1">Acceso administrador</p>
              <p className="ff-body text-xs text-[#8fae9c] mb-4">Ingresá tu PIN para ver precios y editar registros.</p>
              <input
                type="password" autoFocus value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && intentarLogin()}
                placeholder="PIN"
                className="w-full bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 outline-none ff-mono text-sm mb-2 focus:border-[#8fae9c]"
              />
              {errorPin && <p className="ff-body text-xs text-[#ef4444] mb-2">{errorPin}</p>}
              <button onClick={intentarLogin} className="w-full bg-[#8fae9c] text-[#16201c] ff-body text-sm font-medium px-4 py-2 rounded-md hover:bg-[#a8c4b4] transition-colors">
                Ingresar
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <Tab id="trabajos" icon={ClipboardList} label="Trabajos" />
          <Tab id="clientes" icon={Users} label="Clientes" />
          {esAdmin && <Tab id="precios" icon={Settings} label="Precios áridos" />}
        </div>

        {esAdmin ? (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4">
              <p className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] mb-1">Facturado</p>
              <p className="ff-display text-xl text-[#f4ead0]">${totales.costo.toLocaleString("es-AR")}</p>
            </div>
            <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4">
              <p className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] mb-1">Cobrado</p>
              <p className="ff-display text-xl text-[#a8e6b8]">${totales.pagado.toLocaleString("es-AR")}</p>
            </div>
            <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4">
              <p className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] mb-1">Saldo</p>
              <p className="ff-display text-xl text-[#e08a6f]">${totales.saldo.toLocaleString("es-AR")}</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4 mb-8 flex items-center gap-2">
            <EyeOff size={15} className="text-[#5a6b62]" />
            <p className="ff-body text-xs text-[#5a6b62]">Los montos y precios están ocultos. Pedile el acceso de administrador a tu jefe si lo necesitás.</p>
          </div>
        )}

        {vista === "precios" && esAdmin && (
          <div className="space-y-2">
            <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4 mb-3">
              <p className="ff-mono text-[11px] uppercase tracking-wider text-[#8fae9c] mb-2">PIN de acceso para tu equipo</p>
              <p className="ff-body text-xs text-[#5a6b62] mb-3">
                {adminPin ? "Este es el PIN actual que usás para entrar como administrador." : "Todavía no configuraste un PIN normal — solo entrás con tu clave maestra."}
              </p>
              <PinEditor pinActual={adminPin} onGuardar={cambiarPin} />
            </div>
            <p className="ff-body text-xs text-[#8fae9c] mb-3">
              Precio por m³ sin IVA, y costo fijo de viaje que se suma cuando el pedido es de menos de 6 m³ (no llena el camión).
            </p>
            {ARIDOS.map((a) => (
              <div key={a} className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-3 flex items-center gap-3">
                <p className="ff-body text-sm text-[#ece4cf] flex-1">{a}</p>
                <div className="flex items-center gap-1">
                  <span className="ff-mono text-[10px] text-[#5a6b62]">$/m³</span>
                  <input type="number" value={precios[a]?.m3 || ""} placeholder="0"
                    onChange={(e) => guardarPrecios({ ...precios, [a]: { ...precios[a], m3: e.target.value } })}
                    className="w-20 bg-[#16201c] border border-[#3a4a42] rounded-md px-2 py-1 outline-none ff-mono text-xs text-right focus:border-[#8fae9c]" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="ff-mono text-[10px] text-[#5a6b62]">$ viaje</span>
                  <input type="number" value={precios[a]?.viaje || ""} placeholder="0"
                    onChange={(e) => guardarPrecios({ ...precios, [a]: { ...precios[a], viaje: e.target.value } })}
                    className="w-20 bg-[#16201c] border border-[#3a4a42] rounded-md px-2 py-1 outline-none ff-mono text-xs text-right focus:border-[#8fae9c]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {vista === "clientes" && (
          <>
            <div className="flex gap-3 mb-4">
              <div className="flex items-center gap-2 bg-[#1c2722] border border-[#3a4a42] rounded-md px-3 py-2 flex-1">
                <Search size={15} className="text-[#8fae9c]" />
                <input className="bg-transparent outline-none w-full ff-body text-sm placeholder:text-[#5a6b62]" placeholder="Buscar por número, nombre o teléfono..."
                  value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
              </div>
              <button onClick={() => setMostrarFormCliente(!mostrarFormCliente)}
                className="flex items-center gap-2 bg-[#8fae9c] text-[#16201c] ff-body text-sm font-medium px-4 py-2 rounded-md hover:bg-[#a8c4b4] transition-colors shrink-0">
                <Plus size={16} /> Cliente
              </button>
            </div>

            {mostrarFormCliente && (
              <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-5 mb-5">
                <p className="ff-mono text-[11px] uppercase tracking-wider text-[#8fae9c] mb-4">Nuevo cliente</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                    <User size={15} className="text-[#8fae9c] shrink-0" />
                    <input className="bg-transparent outline-none w-full ff-body text-sm placeholder:text-[#5a6b62]" placeholder="Nombre del cliente"
                      value={formCliente.nombre} onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                    <Phone size={15} className="text-[#8fae9c] shrink-0" />
                    <input className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="Teléfono"
                      value={formCliente.telefono} onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                    <Mail size={15} className="text-[#8fae9c] shrink-0" />
                    <input type="email" className="bg-transparent outline-none w-full ff-body text-sm placeholder:text-[#5a6b62]" placeholder="Correo electrónico"
                      value={formCliente.email} onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                    <MapPin size={15} className="text-[#8fae9c] shrink-0" />
                    <input className="bg-transparent outline-none w-full ff-body text-sm placeholder:text-[#5a6b62]" placeholder="Dirección del cliente"
                      value={formCliente.direccion} onChange={(e) => setFormCliente({ ...formCliente, direccion: e.target.value })} />
                  </div>
                </div>
                <button onClick={crearCliente} className="flex items-center gap-2 bg-[#8fae9c] text-[#16201c] ff-body text-sm font-medium px-4 py-2 rounded-md hover:bg-[#a8c4b4] transition-colors">
                  <Plus size={16} /> Guardar cliente
                </button>
              </div>
            )}

            <div className="space-y-2">
              {clientesFiltrados.length === 0 && (
                <p className="ff-body text-sm text-[#5a6b62] text-center py-10">{clientes.length === 0 ? "Todavía no hay clientes registrados." : "Nada coincide con la búsqueda."}</p>
              )}
              {clientesFiltrados.map((c) => {
                const hist = trabajosDeCliente(c.id);
                const saldo = hist.reduce((s, t) => s + totalACobrar(t.costo, t.conIva) - Number(t.pago || 0), 0);
                return (
                  <button key={c.id} onClick={() => { setClienteSeleccionado(c); setVista("clienteDetalle"); }}
                    className="w-full text-left rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4 flex items-center gap-3 hover:border-[#8fae9c] transition-colors">
                    <span className="ff-mono text-xs text-[#16201c] bg-[#8fae9c] rounded-full w-9 h-9 flex items-center justify-center shrink-0 font-semibold">#{c.numero}</span>
                    <div className="flex-1 min-w-0">
                      <p className="ff-display text-lg text-[#f4ead0] truncate">{c.nombre}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {c.telefono && <p className="ff-mono text-xs text-[#8fae9c] flex items-center gap-1"><Phone size={11} /> {c.telefono}</p>}
                        <p className="ff-mono text-xs text-[#5a6b62]">{hist.length} trabajo{hist.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    {esAdmin && saldo > 0 && (
                      <span className="ff-mono text-xs text-[#ef4444] shrink-0 flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef4444]" style={{ boxShadow: "0 0 6px #ef4444" }} /> saldo ${saldo.toLocaleString("es-AR")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {vista === "clienteDetalle" && clienteSeleccionado && (() => {
          const hist = trabajosDeCliente(clienteSeleccionado.id);
          const saldoCliente = hist.reduce((s, t) => s + totalACobrar(t.costo, t.conIva) - Number(t.pago || 0), 0);
          return (
            <>
              <button onClick={() => setVista("clientes")} className="flex items-center gap-1.5 ff-mono text-xs text-[#8fae9c] mb-4 hover:underline">
                <ChevronLeft size={14} /> Todos los clientes
              </button>
              <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-5 mb-5 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="ff-mono text-sm text-[#16201c] bg-[#8fae9c] rounded-full w-11 h-11 flex items-center justify-center shrink-0 font-semibold">#{clienteSeleccionado.numero}</span>
                  <div>
                    <p className="ff-display text-2xl text-[#f4ead0]">{clienteSeleccionado.nombre}</p>
                    {clienteSeleccionado.telefono && <p className="ff-mono text-xs text-[#8fae9c] flex items-center gap-1 mt-1"><Phone size={11} /> {clienteSeleccionado.telefono}</p>}
                    {clienteSeleccionado.email && <p className="ff-mono text-xs text-[#8fae9c] flex items-center gap-1 mt-1"><Mail size={11} /> {clienteSeleccionado.email}</p>}
                    {clienteSeleccionado.direccion && <p className="ff-mono text-xs text-[#8fae9c] flex items-center gap-1 mt-1"><MapPin size={11} /> {clienteSeleccionado.direccion}</p>}
                  </div>
                </div>
                {esAdmin && <button onClick={() => eliminarCliente(clienteSeleccionado.id)} className="text-[#5a6b62] hover:text-[#d97757]"><Trash2 size={16} /></button>}
              </div>
              {esAdmin && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4">
                    <p className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] mb-1">Trabajos</p>
                    <p className="ff-display text-2xl text-[#f4ead0]">{hist.length}</p>
                  </div>
                  <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4">
                    <p className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] mb-1">Saldo pendiente</p>
                    <p className="ff-display text-2xl" style={{ color: saldoCliente > 0 ? "#ef4444" : "#22c55e" }}>${saldoCliente.toLocaleString("es-AR")}</p>
                  </div>
                </div>
              )}
              <p className="ff-mono text-[11px] uppercase tracking-wider text-[#8fae9c] mb-3">Historial</p>
              <div className="space-y-2 mb-5">
                {hist.length === 0 && <p className="ff-body text-sm text-[#5a6b62] py-6">Sin trabajos registrados todavía.</p>}
                {hist.map((t) => <TarjetaTrabajo key={t.id} t={t} mostrarCliente={false} esAdmin={esAdmin} onEliminar={() => eliminarTrabajo(t.id)} onFoto={setFotoAmpliada} onEditar={() => editarTrabajo(t)} onActualizarRemito={actualizarRemito} onMarcarRealizado={() => marcarRealizado(t.id)} />)}
              </div>
              <button onClick={() => { setFormTrabajo({ ...EMPTY_TRABAJO, clienteId: clienteSeleccionado.id }); setVista("trabajos"); }}
                className="w-full flex items-center justify-center gap-2 bg-[#8fae9c] text-[#16201c] ff-body text-sm font-medium px-4 py-2.5 rounded-md hover:bg-[#a8c4b4] transition-colors">
                <Plus size={16} /> Nuevo trabajo para este cliente
              </button>
            </>
          );
        })()}

        {vista === "trabajos" && (
          <>
            <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-5 mb-8">
              <p className="ff-mono text-[11px] uppercase tracking-wider text-[#8fae9c] mb-4">Nuevo trabajo</p>

              <div className="mb-3">
                <label className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] mb-1 block">Cliente</label>
                <select className="w-full bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 outline-none ff-body text-sm text-[#ece4cf] focus:border-[#8fae9c]"
                  value={formTrabajo.clienteId} onChange={(e) => setFormTrabajo({ ...formTrabajo, clienteId: e.target.value })}>
                  <option value="" className="bg-[#16201c]">Seleccionar cliente...</option>
                  {[...clientes].sort((a, b) => a.numero - b.numero).map((c) => <option key={c.id} value={c.id} className="bg-[#16201c]">#{c.numero} — {c.nombre}</option>)}
                </select>
                {clientes.length === 0 && <p className="ff-body text-xs text-[#5a6b62] mt-1.5">No hay clientes todavía — creá uno en la pestaña "Clientes".</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                  <Calendar size={15} className="text-[#8fae9c] shrink-0" />
                  <input type="date" className="bg-transparent outline-none w-full ff-mono text-sm text-[#ece4cf]" value={formTrabajo.fecha}
                    onChange={(e) => setFormTrabajo({ ...formTrabajo, fecha: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                  <MapPin size={15} className="text-[#8fae9c] shrink-0" />
                  <input className="bg-transparent outline-none w-full ff-body text-sm placeholder:text-[#5a6b62]" placeholder="Dirección del trabajo"
                    value={formTrabajo.lugar} onChange={(e) => setFormTrabajo({ ...formTrabajo, lugar: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                  <Layers size={15} className="text-[#8fae9c] shrink-0" />
                  <select className="bg-transparent outline-none w-full ff-body text-sm text-[#ece4cf]" value={formTrabajo.tipo}
                    onChange={(e) => setFormTrabajo({ ...formTrabajo, tipo: e.target.value, costo: "", aridos: [{ ...EMPTY_ARIDO_LINEA }] })}>
                    {TIPOS_TRABAJO.map((t) => <option key={t} value={t} className="bg-[#16201c]">{t}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                  <FileText size={15} className="text-[#8fae9c] shrink-0" />
                  <input className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="N° de remito"
                    value={formTrabajo.remito} onChange={(e) => setFormTrabajo({ ...formTrabajo, remito: e.target.value })} />
                </div>

                <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                  <ClipboardList size={15} className="text-[#8fae9c] shrink-0" />
                  <select className="bg-transparent outline-none w-full ff-body text-sm text-[#ece4cf]" value={formTrabajo.estadoTrabajo}
                    onChange={(e) => setFormTrabajo({ ...formTrabajo, estadoTrabajo: e.target.value })}>
                    <option value="realizado" className="bg-[#16201c]">Realizado</option>
                    <option value="agendado" className="bg-[#16201c]">Agendado para otro día</option>
                  </select>
                </div>
              </div>

              {formTrabajo.estadoTrabajo === "agendado" && (
                <div className="rounded-md border border-[#eab308] bg-[#2a2410] px-3 py-2 mb-3 flex items-center gap-2">
                  <Calendar size={15} className="text-[#eab308] shrink-0" />
                  <p className="ff-body text-xs text-[#eab308]">
                    Este trabajo queda agendado{formTrabajo.fecha ? ` para el ${new Date(formTrabajo.fecha + "T00:00:00").toLocaleDateString("es-AR")}` : ""}. El remito se puede cargar después, cuando se realice.
                  </p>
                </div>
              )}

              <div className="mb-3 space-y-2">
                <label className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] block">Maquinaria utilizada</label>
                {formTrabajo.maquinas.map((linea, i) => (
                  <div key={i} className="rounded-md border border-[#3a4a42] p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c] flex-1">
                          <Wrench size={15} className="text-[#8fae9c] shrink-0" />
                          <select className="bg-transparent outline-none w-full ff-body text-sm text-[#ece4cf]" value={linea.maquina}
                            onChange={(e) => {
                              const nuevasLineas = formTrabajo.maquinas.map((l, idx) => (idx === i ? { ...l, maquina: e.target.value } : l));
                              setFormTrabajo({ ...formTrabajo, maquinas: nuevasLineas, costo: calcularCostoTotalMaquinas(nuevasLineas) });
                            }}>
                            {MAQUINAS.map((m) => <option key={m} value={m} className="bg-[#16201c]">{m}</option>)}
                          </select>
                        </div>
                        {formTrabajo.maquinas.length > 1 && (
                          <button onClick={() => {
                            const nuevasLineas = formTrabajo.maquinas.filter((_, idx) => idx !== i);
                            setFormTrabajo({ ...formTrabajo, maquinas: nuevasLineas, costo: calcularCostoTotalMaquinas(nuevasLineas) });
                          }} className="text-[#5a6b62] hover:text-[#d97757] shrink-0"><X size={16} /></button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                        <HardHat size={15} className="text-[#8fae9c] shrink-0" />
                        <input className="bg-transparent outline-none w-full ff-body text-sm placeholder:text-[#5a6b62]" placeholder="Operador / personal"
                          value={linea.operador} onChange={(e) => {
                            const nuevasLineas = formTrabajo.maquinas.map((l, idx) => (idx === i ? { ...l, operador: e.target.value } : l));
                            setFormTrabajo({ ...formTrabajo, maquinas: nuevasLineas });
                          }} />
                      </div>

                      {linea.maquina === "Camión" && (
                        <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                          <Truck size={15} className="text-[#8fae9c] shrink-0" />
                          <input type="number" className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="Cantidad de viajes"
                            value={linea.cantViajes} onChange={(e) => {
                              const nuevasLineas = formTrabajo.maquinas.map((l, idx) => (idx === i ? { ...l, cantViajes: e.target.value } : l));
                              setFormTrabajo({ ...formTrabajo, maquinas: nuevasLineas, costo: calcularCostoTotalMaquinas(nuevasLineas) });
                            }} />
                        </div>
                      )}

                      {esAdmin && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                            <DollarSign size={15} className="text-[#8fae9c] shrink-0" />
                            <input type="number" className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="Costo máquina"
                              value={linea.costo} onChange={(e) => {
                                const nuevasLineas = formTrabajo.maquinas.map((l, idx) => (idx === i ? { ...l, costo: e.target.value } : l));
                                setFormTrabajo({ ...formTrabajo, maquinas: nuevasLineas, costo: calcularCostoTotalMaquinas(nuevasLineas) });
                              }} />
                          </div>
                          {linea.maquina === "Camión" && (
                            <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                              <DollarSign size={15} className="text-[#8fae9c] shrink-0" />
                              <input type="number" className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="Costo por viaje"
                                value={linea.costoViaje} onChange={(e) => {
                                  const nuevasLineas = formTrabajo.maquinas.map((l, idx) => (idx === i ? { ...l, costoViaje: e.target.value } : l));
                                  setFormTrabajo({ ...formTrabajo, maquinas: nuevasLineas, costo: calcularCostoTotalMaquinas(nuevasLineas) });
                                }} />
                            </div>
                          )}
                          {linea.maquina === "Camión" && linea.costoViaje && linea.cantViajes && (
                            <p className="ff-mono text-xs text-[#8fae9c] col-span-2">
                              Total viajes: {linea.cantViajes} × ${Number(linea.costoViaje).toLocaleString("es-AR")} = ${(Number(linea.costoViaje) * Number(linea.cantViajes)).toLocaleString("es-AR")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setFormTrabajo({ ...formTrabajo, maquinas: [...formTrabajo.maquinas, { ...EMPTY_MAQUINA_LINEA }] })}
                    className="flex items-center gap-1.5 ff-body text-xs text-[#8fae9c] border border-dashed border-[#3a4a42] rounded-md px-3 py-1.5 hover:border-[#8fae9c] transition-colors">
                    <Plus size={13} /> Agregar otra máquina
                  </button>
              </div>

              {formTrabajo.tipo === "Venta de áridos" && (
                <div className="mb-3 space-y-2">
                  <label className="ff-mono text-[10px] uppercase tracking-wider text-[#8fae9c] block">Áridos entregados</label>
                  {formTrabajo.aridos.map((linea, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c] flex-1">
                        <Truck size={15} className="text-[#8fae9c] shrink-0" />
                        <select className="bg-transparent outline-none w-full ff-body text-sm text-[#ece4cf]" value={linea.arido}
                          onChange={(e) => {
                            const nuevasLineas = formTrabajo.aridos.map((l, idx) => (idx === i ? { ...l, arido: e.target.value } : l));
                            const costo = calcularCostoTotalAridos(precios, nuevasLineas);
                            setFormTrabajo({ ...formTrabajo, aridos: nuevasLineas, costo: costo || formTrabajo.costo });
                          }}>
                          {ARIDOS.map((a) => <option key={a} value={a} className="bg-[#16201c]">{a}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c] w-32 shrink-0">
                        <input type="number" className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="m³"
                          value={linea.m3} onChange={(e) => {
                            const nuevasLineas = formTrabajo.aridos.map((l, idx) => (idx === i ? { ...l, m3: e.target.value } : l));
                            const costo = calcularCostoTotalAridos(precios, nuevasLineas);
                            setFormTrabajo({ ...formTrabajo, aridos: nuevasLineas, costo: costo || formTrabajo.costo });
                          }} />
                      </div>
                      {formTrabajo.aridos.length > 1 && (
                        <button onClick={() => {
                          const nuevasLineas = formTrabajo.aridos.filter((_, idx) => idx !== i);
                          const costo = calcularCostoTotalAridos(precios, nuevasLineas);
                          setFormTrabajo({ ...formTrabajo, aridos: nuevasLineas, costo: costo || formTrabajo.costo });
                        }} className="text-[#5a6b62] hover:text-[#d97757] shrink-0"><X size={16} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setFormTrabajo({ ...formTrabajo, aridos: [...formTrabajo.aridos, { ...EMPTY_ARIDO_LINEA }] })}
                    className="flex items-center gap-1.5 ff-body text-xs text-[#8fae9c] border border-dashed border-[#3a4a42] rounded-md px-3 py-1.5 hover:border-[#8fae9c] transition-colors">
                    <Plus size={13} /> Agregar otro árido
                  </button>
                </div>
              )}

              {formTrabajo.tipo === "Venta de áridos" && esAdmin && formTrabajo.aridos.some((l) => l.m3 && Number(l.m3) < 6) && (
                <p className="ff-body text-xs text-[#e6c178] mb-3">Hay líneas con menos de 6 m³: se sumó el costo de viaje correspondiente a cada una.</p>
              )}

              <textarea className="w-full bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 outline-none ff-body text-sm mb-3 resize-none placeholder:text-[#5a6b62] focus:border-[#8fae9c]"
                rows={2} placeholder="Detalle del trabajo realizado" value={formTrabajo.trabajo} onChange={(e) => setFormTrabajo({ ...formTrabajo, trabajo: e.target.value })} />

              {esAdmin ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                      <DollarSign size={15} className="text-[#8fae9c] shrink-0" />
                      <input type="number" className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="Costo (sin IVA)"
                        value={formTrabajo.costo} onChange={(e) => setFormTrabajo({ ...formTrabajo, costo: e.target.value })} />
                    </div>
                    <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 focus-within:border-[#8fae9c]">
                      <DollarSign size={15} className="text-[#8fae9c] shrink-0" />
                      <input type="number" className="bg-transparent outline-none w-full ff-mono text-sm placeholder:text-[#5a6b62]" placeholder="Pago realizado"
                        value={formTrabajo.pago} onChange={(e) => setFormTrabajo({ ...formTrabajo, pago: e.target.value })} />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 ff-body text-sm text-[#c9bfa0] cursor-pointer mb-3">
                    <input type="checkbox" checked={formTrabajo.conIva} onChange={(e) => setFormTrabajo({ ...formTrabajo, conIva: e.target.checked })} className="accent-[#8fae9c]" />
                    Facturar con IVA (21%)
                  </label>

                  {formTrabajo.costo && (
                    <div className="mb-3 ff-mono text-xs space-y-1">
                      <p className="text-[#8fae9c]">Sin IVA: ${Number(formTrabajo.costo || 0).toLocaleString("es-AR")}</p>
                      {formTrabajo.conIva && <p className="text-[#f4ead0]">Con IVA 21%: ${totalACobrar(formTrabajo.costo, true).toLocaleString("es-AR")}</p>}
                      <p className="flex items-center gap-1.5" style={{ color: colorEstado[estadoPago(formTrabajo.costo, formTrabajo.pago, formTrabajo.conIva)] }}>
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorEstado[estadoPago(formTrabajo.costo, formTrabajo.pago, formTrabajo.conIva)], boxShadow: `0 0 6px ${colorEstado[estadoPago(formTrabajo.costo, formTrabajo.pago, formTrabajo.conIva)]}` }} />
                        Saldo: ${(totalACobrar(formTrabajo.costo, formTrabajo.conIva) - Number(formTrabajo.pago || 0)).toLocaleString("es-AR")} · {ESTADOS_PAGO[estadoPago(formTrabajo.costo, formTrabajo.pago, formTrabajo.conIva)]}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="ff-body text-xs text-[#5a6b62] mb-3 flex items-center gap-1.5"><EyeOff size={12} /> Los montos los carga o ve el administrador.</p>
              )}

              <div className="mb-3">
                {formTrabajo.foto ? (
                  <div className="relative inline-block">
                    <img src={formTrabajo.foto} alt="Foto del trabajo" className="h-20 rounded-md border border-[#3a4a42]" />
                    <button onClick={() => setFormTrabajo({ ...formTrabajo, foto: null })} className="absolute -top-2 -right-2 bg-[#16201c] border border-[#3a4a42] rounded-full p-1 text-[#d97757]"><X size={12} /></button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 ff-body text-sm text-[#8fae9c] border border-dashed border-[#3a4a42] rounded-md px-3 py-2 hover:border-[#8fae9c] transition-colors cursor-pointer w-fit">
                    <Camera size={15} /> Agregar foto / remito
                    <input type="file" accept="image/*" onChange={manejarFoto} className="hidden" />
                  </label>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={agregarTrabajo} disabled={!formTrabajo.clienteId || !formTrabajo.fecha}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#8fae9c] text-[#16201c] ff-body text-sm font-medium px-4 py-2.5 rounded-md hover:bg-[#a8c4b4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {editandoId ? <Pencil size={16} /> : <Plus size={16} />} {editandoId ? "Guardar cambios" : "Agregar trabajo"}
                </button>
                {editandoId && (
                  <button onClick={cancelarEdicion} className="ff-body text-sm text-[#8fae9c] border border-[#3a4a42] rounded-md px-4 hover:border-[#8fae9c] transition-colors">
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="flex items-center gap-2 bg-[#1c2722] border border-[#3a4a42] rounded-md px-3 py-2 flex-1">
                <Search size={15} className="text-[#8fae9c]" />
                <input className="bg-transparent outline-none w-full ff-body text-sm placeholder:text-[#5a6b62]" placeholder="Buscar cliente, lugar, remito..."
                  value={buscaTrabajo} onChange={(e) => setBuscaTrabajo(e.target.value)} />
              </div>
              {esAdmin && (
                <div className="flex gap-1 flex-wrap">
                  {["todos", "pagado", "parcial", "pendiente"].map((f) => (
                    <button key={f} onClick={() => setFiltroEstado(f)}
                      className={`ff-mono text-xs px-3 py-2 rounded-md border transition-colors capitalize ${filtroEstado === f ? "bg-[#8fae9c] text-[#16201c] border-[#8fae9c]" : "border-[#3a4a42] text-[#8fae9c] hover:border-[#8fae9c]"}`}>
                      {f === "todos" ? "Todos" : ESTADOS_PAGO[f]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!esAdmin && (
              <p className="ff-body text-xs text-[#5a6b62] mb-3 flex items-center gap-1.5">
                <Calendar size={12} /> Mostrando solo los trabajos agendados pendientes de realizar.
              </p>
            )}

            <div className="space-y-2">
              {trabajosFiltrados.length === 0 && (
                <p className="ff-body text-sm text-[#5a6b62] text-center py-10">
                  {trabajos.length === 0
                    ? "Todavía no hay trabajos registrados."
                    : esAdmin ? "Nada coincide con la búsqueda." : "No hay trabajos agendados pendientes."}
                </p>
              )}
              {trabajosFiltrados.map((t) => (
                <TarjetaTrabajo key={t.id} t={t} mostrarCliente esAdmin={esAdmin} nombreCliente={nombreCliente(t.clienteId)} onEliminar={() => eliminarTrabajo(t.id)} onFoto={setFotoAmpliada} onEditar={() => editarTrabajo(t)} onActualizarRemito={actualizarRemito} onMarcarRealizado={() => marcarRealizado(t.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      {fotoAmpliada && (
        <div onClick={() => setFotoAmpliada(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50 cursor-pointer">
          <img src={fotoAmpliada} alt="Foto ampliada" className="max-h-[85vh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

function TarjetaTrabajo({ t, mostrarCliente, nombreCliente, esAdmin, onEliminar, onFoto, onEditar, onActualizarRemito, onMarcarRealizado }) {
  const total = totalACobrar(t.costo, t.conIva);
  const estado = estadoPago(t.costo, t.pago, t.conIva);
  const saldo = total - Number(t.pago || 0);
  const agendado = t.estadoTrabajo === "agendado";
  const maquinasLista = t.maquinas && t.maquinas.length ? t.maquinas : (t.maquina ? [{ maquina: t.maquina, operador: t.operador || "" }] : []);
  return (
    <div className="rounded-lg border border-[#3a4a42] bg-[#1c2722] p-4 flex items-start gap-3">
      {t.foto && <img src={t.foto} alt="Foto" onClick={() => onFoto(t.foto)} className="w-14 h-14 rounded-md object-cover border border-[#3a4a42] shrink-0 cursor-pointer" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          {mostrarCliente ? <p className="ff-display text-lg text-[#f4ead0] truncate">{nombreCliente}</p> : <p className="ff-display text-lg text-[#f4ead0] truncate">{t.lugar || t.tipo}</p>}
          <p className="ff-mono text-xs text-[#8fae9c] shrink-0">{new Date(t.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {mostrarCliente && t.lugar && <p className="ff-body text-xs text-[#8fae9c] flex items-center gap-1"><MapPin size={11} /> {t.lugar}</p>}
          {agendado && (
            <span className="ff-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#2a2410] border border-[#eab308] text-[#eab308] flex items-center gap-1">
              <Calendar size={10} /> Agendado
            </span>
          )}
          <span className="ff-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#16201c] border border-[#3a4a42] text-[#8fae9c]">{t.tipo}</span>
          {t.tipo === "Venta de áridos"
            ? (t.aridos && t.aridos.length
                ? t.aridos.map((l, i) => l.arido && (
                    <span key={i} className="ff-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#16201c] border border-[#3a4a42] text-[#e6c178]">{l.arido} {l.m3 ? `· ${l.m3} m³` : ""}</span>
                  ))
                : (t.arido && <span className="ff-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#16201c] border border-[#3a4a42] text-[#e6c178]">{t.arido} {t.m3 ? `· ${t.m3} m³` : ""}</span>))
            : maquinasLista.map((l, i) => l.maquina && (
                <span key={i} className="ff-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#16201c] border border-[#3a4a42] text-[#e6c178]">{l.maquina}</span>
              ))}
          {maquinasLista.filter((l) => l.operador).map((l, i) => (
            <span key={`op-${i}`} className="ff-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#16201c] border border-[#3a4a42] text-[#8fae9c] flex items-center gap-1"><HardHat size={10} /> {l.operador}</span>
          ))}
          {t.remito && <span className="ff-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#16201c] border border-[#3a4a42] text-[#8fae9c] flex items-center gap-1"><FileText size={10} /> {t.remito}</span>}
        </div>
        {t.trabajo && <p className="ff-body text-sm text-[#c9bfa0] mt-1.5">{t.trabajo}</p>}

        {!t.remito && agendado && (
          <RemitoInline onGuardar={(valor) => onActualizarRemito(t.id, valor)} />
        )}

        {!esAdmin && agendado && (
          <button onClick={onMarcarRealizado}
            className="flex items-center gap-1.5 mt-2 ff-body text-xs text-[#16201c] bg-[#8fae9c] hover:bg-[#a8c4b4] rounded-md px-3 py-1.5 transition-colors">
            <CheckCircle2 size={14} /> Marcar como realizado
          </button>
        )}

        {esAdmin && (
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <p className="ff-mono text-sm text-[#f4ead0]">${total.toLocaleString("es-AR")}{t.conIva ? " (con IVA)" : ""}</p>
            <span className="flex items-center gap-1.5 ff-mono text-xs" style={{ color: colorEstado[estado] }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorEstado[estado], boxShadow: `0 0 6px ${colorEstado[estado]}` }} />
              {ESTADOS_PAGO[estado]}{saldo > 0 ? ` · saldo $${saldo.toLocaleString("es-AR")}` : ""}
            </span>
          </div>
        )}
      </div>
      {esAdmin && (
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={onEditar} className="text-[#5a6b62] hover:text-[#8fae9c]"><Pencil size={16} /></button>
          <button onClick={onEliminar} className="text-[#5a6b62] hover:text-[#d97757]"><Trash2 size={16} /></button>
        </div>
      )}
    </div>
  );
}

function RemitoInline({ onGuardar }) {
  const [valor, setValor] = useState("");
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex items-center gap-2 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-1.5 focus-within:border-[#8fae9c] flex-1">
        <FileText size={13} className="text-[#8fae9c] shrink-0" />
        <input className="bg-transparent outline-none w-full ff-mono text-xs placeholder:text-[#5a6b62]" placeholder="Cargar N° de remito cuando se realice"
          value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <button onClick={() => valor.trim() && onGuardar(valor.trim())}
        className="bg-[#8fae9c] text-[#16201c] ff-body text-xs font-medium px-3 py-1.5 rounded-md hover:bg-[#a8c4b4] transition-colors shrink-0">
        Guardar
      </button>
    </div>
  );
}

function PinEditor({ pinActual, onGuardar }) {
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState(null); // null | "ok" | "error" | "guardando"

  async function handleGuardar() {
    if (valor.length < 4) { setEstado("corto"); return; }
    setEstado("guardando");
    const ok = await onGuardar(valor);
    if (ok) { setValor(""); setEstado("ok"); }
    else setEstado("error");
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="password" placeholder={pinActual ? "Nuevo PIN (mín. 4 dígitos)" : "Crear PIN (mín. 4 dígitos)"}
          value={valor} onChange={(e) => { setValor(e.target.value); setEstado(null); }}
          className="flex-1 bg-[#16201c] border border-[#3a4a42] rounded-md px-3 py-2 outline-none ff-mono text-sm focus:border-[#8fae9c]"
        />
        <button onClick={handleGuardar} disabled={estado === "guardando"}
          className="bg-[#8fae9c] text-[#16201c] ff-body text-sm font-medium px-3 py-2 rounded-md hover:bg-[#a8c4b4] transition-colors shrink-0 disabled:opacity-50">
          {estado === "guardando" ? "Guardando..." : "Guardar"}
        </button>
      </div>
      {estado === "ok" && <p className="ff-mono text-xs text-[#22c55e] mt-2">✓ PIN guardado correctamente. Probá cerrar sesión y volver a entrar con él.</p>}
      {estado === "error" && <p className="ff-mono text-xs text-[#ef4444] mt-2">✗ No se pudo guardar. Probá de nuevo — si falla otra vez, puede ser problema de conexión.</p>}
      {estado === "corto" && <p className="ff-mono text-xs text-[#eab308] mt-2">El PIN necesita al menos 4 caracteres.</p>}
    </div>
  );
}
