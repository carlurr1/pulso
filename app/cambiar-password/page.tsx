"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logout } from "@/app/login/actions";
import { Activity, ShieldCheck } from "lucide-react";

export default function CambiarPassword() {
  const router = useRouter();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    setErr("");
    if (p1.length < 8) { setErr("La contraseña debe tener al menos 8 caracteres."); return; }
    if (p1 !== p2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      const sb = createClient();
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) { setErr(error.message); setBusy(false); return; }
      await sb.rpc("marcar_pass_cambiada");
      router.push("/");
      router.refresh();
    } catch (e: any) { setErr(e?.message ?? "Error al guardar"); setBusy(false); }
  };

  return (
    <div className="loginwrap">
      <div className="logincard">
        <div className="login-brand">
          <div className="brandmark-blue"><Activity size={24} color="#fff" /></div>
          <div><div className="brandname">Pulso</div><div className="brandsub-dark">Primer ingreso</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <ShieldCheck size={18} style={{ color: "var(--primary)" }} />
          <h2 className="h2">Crea tu contraseña</h2>
        </div>
        <p className="sub" style={{ marginBottom: 18 }}>Por seguridad, define una contraseña propia antes de continuar. Tu coordinador no podrá verla.</p>
        <label className="lbl">Nueva contraseña</label>
        <input className="inp" type="password" value={p1} placeholder="Mínimo 8 caracteres" onChange={(e) => setP1(e.target.value)} />
        <div style={{ height: 12 }} />
        <label className="lbl">Repite la contraseña</label>
        <input className="inp" type="password" value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} />
        {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
        <button className="btn primary block" disabled={busy} onClick={guardar}>{busy ? "Guardando…" : "Guardar y entrar"}</button>
        <div className="divider" />
        <button className="btn ghost block" onClick={() => logout()}>Cerrar sesión</button>
      </div>
    </div>
  );
}
