"use client";
import { useActionState } from "react";
import { login } from "./actions";

// Pantalla de acceso moderna: panel visual con el logo + formulario.
export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return (
    <div className="loginsplit">
      <aside className="loginhero">
        <div className="heroglow" />
        <div className="herologo"><img src="/pulso-logo.png" alt="Pulso" /></div>
        <div className="herobottom">
          <div className="herotag">Monitoreo de productividad · Help Desk ETB</div>
          <div className="herocobrand">
            <img src="/groupcos.png" alt="Group Cos" height={18} />
            <span>para</span>
            <img src="/etb.png" alt="eTb" height={26} />
          </div>
        </div>
      </aside>

      <main className="loginpane">
        <div className="loginbox">
          <div className="loginbadge"><img src="/pulso-mark.png" alt="" /></div>
          <h2 className="loginh">Bienvenido de vuelta</h2>
          <p className="sub">Ingresa con el usuario y la contraseña que te asignó tu coordinador.</p>

          <form action={action} className="login-form">
            <label className="lbl">Usuario</label>
            <input className="inp upper" name="usuario" placeholder="Usuario" autoComplete="username"
              onChange={(e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, ""); }} />
            <label className="lbl">Contraseña</label>
            <input className="inp" name="password" type="password" placeholder="••••••••" autoComplete="current-password" />
            {state?.error && <p className="err">{state.error}</p>}
            <button className="btn primary block" type="submit" disabled={pending}>
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div className="loginfoot sub tiny">Acceso seguro · Las contraseñas se guardan cifradas.</div>
        </div>
      </main>
    </div>
  );
}
