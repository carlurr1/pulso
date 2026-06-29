import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import Bloqueado from "@/components/Bloqueado";
import type { Usuario } from "@/lib/types";

// Punto de entrada autenticado. Resuelve el perfil en el servidor y entrega
// el rol al Dashboard, que decide qué vista renderizar.
export default async function Home() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await sb.from("usuarios").select("*").eq("id", user.id).single();
  if (!perfil) redirect("/login");
  if (perfil.bloqueado) return <Bloqueado />;
  if (perfil.debe_cambiar_pass) redirect("/cambiar-password");

  return <Dashboard perfil={perfil as Usuario} />;
}
