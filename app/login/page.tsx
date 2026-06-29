"use client";
import { useActionState } from "react";
import { login } from "./actions";

// Pantalla de acceso. Replica el diseño del prototipo (logos eTb + Group Cos).
// Coloca los logos en /public: /public/etb.png y /public/groupcos.png
export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return (
    <div className="loginwrap">
      <div className="logincard">
        <div className="login-brand">
          <div className="brandmark-blue">
            {/* ícono Activity de lucide-react o un SVG propio */}
            <span style={{ color: "#fff", fontWeight: 700 }}>P</span>
          </div>
          <div>
            <div className="brandname">Pulso</div>
            <div className="brandsub-dark">Centro de operaciones · Group COS</div>
          </div>
        </div>

        <h2 className="h2">Inicia sesión</h2>
        <p className="sub">Usa el usuario y la contraseña que te asignó tu coordinador.</p>

        <form action={action} className="login-form">
          <label className="lbl">Usuario</label>
          <input className="inp upper" name="usuario" placeholder="Usuario" autoComplete="username"
            onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }} />
          <label className="lbl">Contraseña</label>
          <input className="inp" name="password" type="password" placeholder="••••••••" autoComplete="current-password" />
          {state?.error && <p className="err">{state.error}</p>}
          <button className="btn primary block" type="submit" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="divider" />
        <div className="cobrand">
          <img src="/groupcos.png" alt="Group Cos" height={18} />
          <span className="sub">para</span>
          <img src="/etb.png" alt="eTb" height={27} />
        </div>
      </div>
    </div>
  );
}
