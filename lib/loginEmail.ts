// Convierte el usuario genérico (ej. "decheverri") en un email técnico interno
// que Supabase Auth usa por debajo y que nunca se le envía a nadie.
// Limpia tildes, espacios y símbolos para que siempre sea un email válido.
export const EMAIL_DOMAIN = "pulso.groupcos.co";
export const slugLogin = (login: string) =>
  String(login ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");                       // solo caracteres válidos
export const loginToEmail = (login: string) => `${slugLogin(login)}@${EMAIL_DOMAIN}`;
