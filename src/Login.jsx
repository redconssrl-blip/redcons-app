import { useState } from "react";
import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      setError("Email o contraseña incorrectos");
    }
    setCargando(false);
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#16201c" }}>
      <form onSubmit={handleLogin} style={{ background: "#1c2722", padding: 24, borderRadius: 12, width: 280 }}>
        <h2 style={{ color: "#a8e6b8", marginBottom: 16 }}>Redcons</h2>
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 6 }}
          required
        />
        <input
          type="password" placeholder="Contraseña" value={pass}
          onChange={(e) => setPass(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 6 }}
          required
        />
        {error && <p style={{ color: "#ff8f8f", fontSize: 12 }}>{error}</p>}
        <button type="submit" disabled={cargando}
          style={{ width: "100%", padding: 10, borderRadius: 6, background: "#8fae9c", border: "none" }}>
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
