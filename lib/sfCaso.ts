import { sfLogin, sfQuery } from "./salesforce";

// Campos ESTÁNDAR del objeto Case (existen en cualquier org de Salesforce).
// Si más adelante quieres NIT o Grupo (campos personalizados __c), se añaden aquí.
// Traemos varias fuentes del cliente: en Mayoristas el cliente va en la Cuenta
// (Account.Name), pero en otros segmentos puede venir en el Contacto o en los
// campos "Supplied" del caso. Por eso se consultan todos y se toma el primero
// que tenga valor (ver mapeo de `cliente` abajo).
const CASE_FIELDS =
  "CaseNumber, Status, Priority, Type, Reason, Origin, CreatedDate, ClosedDate, IsEscalated, Account.Name, Contact.Name, SuppliedName, SuppliedCompany, Owner.Name";

// Salesforce limita el largo de una SOQL (y de la URL). Con muchos casos de
// varios segmentos pegados a la vez, un solo IN(...) podía pasarse del límite y
// devolver 0 resultados (parecía que "solo traía mayoristas"). Consultamos en
// lotes para que siempre traiga el cliente de TODOS los segmentos.
const LOTE = 200;

export interface CasoSF {
  numero_caso: string;
  cliente: string | null;
  estado: string | null;
  prioridad: string | null;
  tipo: string | null;
  motivo: string | null;
  origen: string | null;
  fecha_creacion: string | null;
  fecha_cierre: string | null;
  escalado: boolean | null;
  owner: string | null;
}

// Consulta uno o varios casos por número (un solo login, en lotes de LOTE).
export async function consultarCasos(numeros: string[]): Promise<CasoSF[]> {
  const limpios = [...new Set(numeros.map((n) => n.trim()).filter(Boolean))];
  if (!limpios.length) return [];
  const session = await sfLogin();
  const records: any[] = [];
  for (let i = 0; i < limpios.length; i += LOTE) {
    const lote = limpios.slice(i, i + LOTE);
    const inList = lote.map((n) => `'${n.replace(/'/g, "")}'`).join(",");
    const soql = `SELECT ${CASE_FIELDS} FROM Case WHERE CaseNumber IN (${inList})`;
    const { records: r } = await sfQuery(session, soql);
    records.push(...r);
  }
  return records.map((r: any) => ({
    numero_caso: String(r.CaseNumber),
    // Cliente desde cualquier segmento: Cuenta → Contacto → empresa/nombre del caso.
    cliente: r.Account?.Name ?? r.Contact?.Name ?? r.SuppliedCompany ?? r.SuppliedName ?? null,
    estado: r.Status ?? null,
    prioridad: r.Priority ?? null,
    tipo: r.Type ?? null,
    motivo: r.Reason ?? null,
    origen: r.Origin ?? null,
    fecha_creacion: r.CreatedDate ?? null,
    fecha_cierre: r.ClosedDate ?? null,
    escalado: typeof r.IsEscalated === "boolean" ? r.IsEscalated : null,
    owner: r.Owner?.Name ?? null,
  }));
}
