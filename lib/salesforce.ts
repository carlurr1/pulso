// ─── Cliente Salesforce (servidor) ───────────────────────────────
// Reutiliza la lógica probada de mayoristas-tracker: login SOAP + query REST.
// Solo se usa desde Server Actions (las credenciales viven en el servidor).
interface SFSession {
  sessionId: string;
  instanceUrl: string;
}

export async function sfLogin(): Promise<SFSession> {
  const username = process.env.SF_USERNAME!;
  const password = process.env.SF_PASSWORD!;
  const token = process.env.SF_TOKEN!;
  const domain = process.env.SF_DOMAIN || "login";
  if (!username || !password || !token) {
    throw new Error("Credenciales SF no configuradas en variables de entorno.");
  }
  const loginUrl = `https://${domain}.salesforce.com/services/Soap/u/59.0`;
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<env:Body>
<n1:login xmlns:n1="urn:partner.soap.sforce.com">
  <n1:username>${username}</n1:username>
  <n1:password>${password}${token}</n1:password>
</n1:login>
</env:Body>
</env:Envelope>`;
  const res = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml", SOAPAction: "login" },
    body: soapBody,
  });
  const xml = await res.text();
  if (xml.includes("INVALID_LOGIN") || xml.includes("faultstring")) {
    const match = xml.match(/<faultstring>(.*?)<\/faultstring>/);
    throw new Error(`Login SF fallido: ${match?.[1] ?? "credenciales incorrectas"}`);
  }
  const sessionMatch = xml.match(/<sessionId>(.*?)<\/sessionId>/);
  const urlMatch = xml.match(/<serverUrl>(.*?)<\/serverUrl>/);
  if (!sessionMatch || !urlMatch) throw new Error("No se pudo extraer sesión de Salesforce");
  return {
    sessionId: sessionMatch[1],
    instanceUrl: urlMatch[1].split("/services/Soap/")[0],
  };
}

export async function sfQuery(
  session: SFSession,
  soql: string
): Promise<{ records: any[]; totalSize: number }> {
  const url = `${session.instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${session.sessionId}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SF query error ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.errorCode) throw new Error(`SF error [${data.errorCode}]: ${data.message}`);
  return data;
}
