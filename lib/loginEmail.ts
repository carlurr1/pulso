// Convierte el usuario genérico (ej. "decheverri") en un email técnico interno
// que Supabase Auth usa por debajo y que nunca se le envía a nadie.
export const EMAIL_DOMAIN = "pulso.groupcos.co";
export const loginToEmail = (login: string) =>
  `${login.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
