import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyDHD94Bt_KiJz-rxjhlwWadkNQnn_th4sc",
  authDomain: "redcons-app.firebaseapp.com",
  projectId: "redcons-app",
  storageBucket: "redcons-app.firebasestorage.app",
  messagingSenderId: "297829889400",
  appId: "1:297829889400:web:ebc367f0e253af429a048d"
}

const VAPID_KEY = "BNRHe9akUYatlOdGEyZ6UOJaRHDPcSKBW5Xcyz-hXFY9ikrpMGmsoCQNb8Fcv9GbM7nx7U2zqVyJUyi6_Nep8A0"

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

export const authReady = signInAnonymously(auth).catch((e) => {
  console.error("Error auth anónimo:", e)
})

export async function pedirTokenPush() {
  try {
    const soportado = await isSupported()
    if (!soportado) return null
    const permiso = await Notification.requestPermission()
    if (permiso !== "granted") return null
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
    return token || null
  } catch (e) {
    console.error("Error pidiendo permiso de notificaciones:", e)
    return null
  }
}
