"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loginToEmail } from "@/lib/loginEmail";

export async function login(_prev: unknown, formData: FormData) {
  const usuario = String(formData.get("usuario") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!usuario || !password) return { error: "Escribe tu usuario y contraseña." };

  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({
    email: loginToEmail(usuario),
    password,
  });
  if (error) return { error: "Usuario o contraseña incorrectos." };
  redirect("/");
}

export async function logout() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
