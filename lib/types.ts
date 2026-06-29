export type Rol = "agente" | "senior" | "coordinador" | "superadmin";
export type Estado = "pendiente" | "progreso" | "gestionado";
export type Categoria =
  | "casos" | "comms" | "tecnico" | "permisos" | "escal" | "reunion" | "interna";

export interface Usuario {
  id: string;
  login: string;
  nombre: string;
  apellido: string | null;
  rol: Rol;
  cargo: string | null;
  code: string | null;
  servicio: string | null;
  mesa: string | null;
  activo: boolean;
}

export interface GestionTipo {
  id: string;
  nombre: string;
  categoria: Categoria;
  umbral_min: number;
  senior_only: boolean;
  activo: boolean;
  orden: number;
}

export interface Asignacion {
  id: string;
  fecha: string;
  user_id: string;
  numero_caso: string;
  estado: Estado;
  asignado_por: string | null;
}

export interface Gestion {
  id: string;
  user_id: string;
  tipo_id: string;
  numero_caso: string;
  minutos: number;
  asignacion_id: string | null;
  fecha: string;
  registrado_at: string;
  nota: string | null;
}

export interface MetricaPersona {
  user_id: string;
  nombre: string;
  apellido: string;
  cargo: string;
  grupo: string;
  asignados: number;
  gestionados: number;
  efectividad: number | null;
  minutos: number;
  disponible: number;
  productividad: number;
  llamadas: number;
  demanda: "ALTO" | "MEDIO" | "BAJO" | "SIN DEMANDA";
}

export const CATS: Record<Categoria, { label: string; color: string }> = {
  casos:    { label: "Casos",          color: "#0098D6" },
  comms:    { label: "Comunicaciones", color: "#6D5AE6" },
  tecnico:  { label: "Técnico",        color: "#F2A33C" },
  permisos: { label: "Permisos",       color: "#D858A0" },
  escal:    { label: "Escalamiento",   color: "#E5484D" },
  reunion:  { label: "Reuniones",      color: "#14B8C4" },
  interna:  { label: "Gestión interna",color: "#6B7793" },
};
