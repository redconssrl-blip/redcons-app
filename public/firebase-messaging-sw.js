importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDHD94Bt_KiJz-rxjhlwWadkNQnn_th4sc",
  authDomain: "redcons-app.firebaseapp.com",
  projectId: "redcons-app",
  storageBucket: "redcons-app.firebasestorage.app",
  messagingSenderId: "297829889400",
  appId: "1:297829889400:web:ebc367f0e253af429a048d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const titulo = payload.notification?.title || "Redcons - Agenda";
  const opciones = {
    body: payload.notification?.body || "",
    icon: "/icon-192.png",
  };
  self.registration.showNotification(titulo, opciones);
});
