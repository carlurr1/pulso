"use client";
import { useActionState, useEffect, useState } from "react";
import { login, solicitarReset } from "./actions";

// Pantalla de acceso moderna: panel visual con el logo + formulario.
export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  const [reset, resetAction, resetPending] = useActionState(solicitarReset, null);
  const [modo, setModo] = useState<"login" | "reset">("login");
  const [avisoReset, setAvisoReset] = useState("");

  // Si el enlace de recuperación falló o expiró, avisamos aquí.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset") === "error") {
      setAvisoReset("El enlace no es válido o ya expiró. Solicita uno nuevo con “¿Olvidaste tu contraseña?”.");
    }
  }, []);

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

          {modo === "login" ? (
            <>
              <h2 className="loginh">Bienvenido de vuelta</h2>
              <p className="sub">Ingresa con el usuario y la contraseña que te asignó tu coordinador.</p>

              <form action={action} className="login-form">
                <label className="lbl">Usuario</label>
                <input className="inp upper" name="usuario" placeholder="Usuario" autoComplete="username"
                  onChange={(e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, ""); }} />
                <label className="lbl">Contraseña</label>
                <input className="inp" name="password" type="password" placeholder="••••••••" autoComplete="current-password" />
                {state?.error && <p className="err">{state.error}</p>}
                {avisoReset && <p className="err">{avisoReset}</p>}
                <button className="btn primary block" type="submit" disabled={pending}>
                  {pending ? "Entrando…" : "Entrar"}
                </button>
              </form>

              <button type="button" className="linkbtn" style={{ marginTop: 14 }}
                onClick={() => setModo("reset")}>
                ¿Olvidaste tu contraseña?
              </button>
            </>
          ) : (
            <>
              <h2 className="loginh">Restablecer contraseña</h2>
              <p className="sub">Escribe tu usuario o tu correo. Te enviaremos un enlace para crear una contraseña nueva.</p>

              <form action={resetAction} className="login-form">
                <label className="lbl">Usuario o correo</label>
                <input className="inp" name="ident" placeholder="Usuario o correo" autoComplete="username" />
                {reset?.error && <p className="err">{reset.error}</p>}
                {reset?.msg && <p className="ok">{reset.msg}</p>}
                <button className="btn primary block" type="submit" disabled={resetPending}>
                  {resetPending ? "Enviando…" : "Enviar enlace"}
                </button>
              </form>

              <button type="button" className="linkbtn" style={{ marginTop: 14 }}
                onClick={() => setModo("login")}>
                ← Volver al inicio de sesión
              </button>
            </>
          )}

          <div className="loginfoot sub tiny">Acceso seguro · Las contraseñas se guardan cifradas.</div>
        </div>
      </main>
    </div>
  );
}
