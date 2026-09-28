import admin from "firebase-admin";

function getAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin;
}

export default async function handler(req, res) {
  try {
    const app = getAdmin();
    const db = app.firestore();
    const messaging = app.messaging();

    const ahora = new Date();
    const local = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
    local.setUTCDate(local.getUTCDate() + 1);
    const manana = local.toISOString().slice(0, 10);

    const agendaSnap = await db.collection("agenda").where("fecha", "==", manana).get();
    console.log("Avisos | mañana:", manana, "| items en agenda:", agendaSnap.size);
    if (agendaSnap.empty) {
      return res.status(200).json({ enviados: 0, manana, mensaje: "Nada agendado para mañana" });
    }

    const tokensSnap = await db.collection("agenda_tokens").get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    console.log("Avisos | tokens registrados:", tokens.length);
    if (tokens.length === 0) {
      return res.status(200).json({ enviados: 0, manana, mensaje: "No hay dispositivos con avisos activados" });
    }

    let enviados = 0;
    const errores = [];

    for (const item of agendaSnap.docs.map((d) => d.data())) {
      const titulo = item.tipo === "trabajo" ? "📋 Trabajo mañana" : "📝 Trámite mañana";
      const cuerpo = item.lugar ? `${item.cliente} — ${item.lugar}` : item.cliente;

      const respuesta = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: titulo, body: cuerpo },
        webpush: { headers: { Urgency: "high", TTL: "86400" } },
        android: { priority: "high" },
      });

      enviados += respuesta.successCount;
      console.log("Avisos |", cuerpo, "| ok:", respuesta.successCount, "| fallos:", respuesta.failureCount);

      const borrados = [];
      respuesta.responses.forEach((r, i) => {
        if (!r.success) {
          const codigo = r.error?.code || "desconocido";
          errores.push(codigo);
          console.error("Avisos | fallo token", i, codigo, r.error?.message);
          if (codigo === "messaging/registration-token-not-registered") {
            borrados.push(db.collection("agenda_tokens").doc(tokens[i]).delete().catch(() => {}));
          }
        }
      });
      await Promise.all(borrados);
    }

    return res.status(200).json({
      manana,
      items: agendaSnap.size,
      tokens: tokens.length,
      enviados,
      errores,
    });
  } catch (e) {
    console.error("Error enviando avisos:", e);
    return res.status(500).json({ error: e.message });
  }
}
