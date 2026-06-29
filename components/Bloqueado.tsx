"use client";
import { logout } from "@/app/login/actions";
import { Lock } from "lucide-react";

export default function Bloqueado() {
  return (
    <div className="loginwrap">
      <div className="logincard" style={{ textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--danger-50)", color: "var(--danger)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
          <Lock size={26} />
        </div>
        <div className="h2">Cuenta bloqueada</div>
        <p className="sub" style={{ marginBottom: 20 }}>Tu acceso está temporalmente deshabilitado. Contacta a tu coordinador para reactivarlo.</p>
        <button className="btn ghost block" onClick={() => logout()}>Cerrar sesión</button>
      </div>
    </div>
  );
}
