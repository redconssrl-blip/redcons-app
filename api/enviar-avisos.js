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
    if (agendaSnap.empty) {
      return res.status(200).json({ enviados: 0, mensaje: "Nada agendado para mañana" });
    }

    const tokensSnap = await db.collection("agenda_tokens").get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (tokens.length === 0) {
      return res.status(200).json({ enviados: 0, mensaje: "No hay dispositivos con avisos activados" });
    }

    let enviados = 0;
    for (const item of agendaSnap.docs.map((d) => d.data())) {
      const titulo = item.tipo === "trabajo" ? "📋 Trabajo mañana" : "📝 Trámite mañana";
      const cuerpo = item.lugar ? `${item.cliente} — ${item.lugar}` : item.cliente;

      const respuesta = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: titulo, body: cuerpo },
      });
      enviados += respuesta.successCount;

      respuesta.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
          db.collection("agenda_tokens").doc(tokens[i]).delete().catch(() => {});
        }
      });
    }

    return res.status(200).json({ enviados });
  } catch (e) {
    console.error("Error enviando avisos:", e);
    return res.status(500).json({ error: e.message });
  }
}
