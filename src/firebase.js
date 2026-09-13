import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDHD94Bt_KiJz-rxjhlwWadkNQnn_th4sc",
  authDomain: "redcons-app.firebaseapp.com",
  projectId: "redcons-app",
  storageBucket: "redcons-app.firebasestorage.app",
  messagingSenderId: "297829889400",
  appId: "1:297829889400:web:ebc367f0e253af429a048d"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// Inicia sesión anónima automáticamente. App.jsx espera esta promesa
// antes de leer/escribir en Firestore, para que las reglas puedan exigir auth.
export const authReady = signInAnonymously(auth).catch((e) => {
  console.error("Error auth anónimo:", e)
})
