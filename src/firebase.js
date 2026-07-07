import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

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
