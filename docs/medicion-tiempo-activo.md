# Medición de tiempo activo (Idle Detection) — cómo quitar el "Permitir"

Pulso mide el tiempo activo en el PC con la **Idle Detection API** de Chrome/Edge.
Esa API exige un permiso del navegador ("Permitir"), que **ninguna página web
puede auto-concederse**: es un control de seguridad del navegador.

Hay dos capas para que el agente nunca tenga que decidir:

## 1. Política de empresa (la solución definitiva)

Chrome tiene la política **`IdleDetectionAllowedForUrls`**, que pre-concede el
permiso a los orígenes que se indiquen: el navegador **nunca pregunta** y la
medición arranca sola al abrir Pulso.

Referencia oficial: <https://chromeenterprise.google/policies/idle-detection-allowed-for-urls/>

### Opción A — GPO (dominio Windows)

Con las plantillas ADMX de Chrome instaladas:

`Configuración del equipo → Plantillas administrativas → Google Chrome →
Configuración de contenido → "Allow idle detection on these sites"` → habilitar
y agregar la URL de Pulso, por ejemplo:

```
https://TU-DOMINIO-DE-PULSO
```

### Opción B — Registro de Windows (sin GPO)

Distribuir el archivo `docs/pulso-idle-chrome.reg` (editar primero el dominio)
o ejecutar en cada equipo con permisos de administrador:

```
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\IdleDetectionAllowedForUrls" /v 1 /t REG_SZ /d "https://TU-DOMINIO-DE-PULSO" /f
```

Reiniciar Chrome. Verificar en `chrome://policy` que la política aparece, y en
Pulso que ya no pide nada.

Para **Microsoft Edge** la clave equivalente vive bajo
`HKLM\SOFTWARE\Policies\Microsoft\Edge\IdleDetectionAllowedForUrls`; verificar
en `edge://policy` que la toma (Edge es Chromium, pero conviene confirmar en la
versión desplegada).

### Opción C — Google Admin Console (Chrome administrado)

`Dispositivos → Chrome → Configuración → Usuarios y navegadores → Idle Detection`
→ permitir para el origen de Pulso.

## 2. Candado en la app (mientras la política no esté aplicada)

Para los equipos donde la política aún no llegue, Pulso bloquea la interfaz de
los roles **agente** y **senior** con un aviso a pantalla completa hasta que el
permiso quede concedido:

- Permiso en `prompt` → botón **"Activar medición"** que dispara el diálogo del
  navegador. No se puede usar la app sin resolverlo.
- Permiso en `denied` (alguien le dio "Bloquear") → instrucciones para
  reactivarlo desde el candado de la barra de direcciones y botón de recarga.

Los roles coordinador y superadmin no se bloquean (conservan la petición
silenciosa en el primer clic).

## Notas

- El permiso se guarda **por origen y por perfil de navegador**: concedido una
  vez, no vuelve a preguntar.
- Firefox y Safari no implementan la API: en esos navegadores no se mide el
  tiempo activo en PC (el resto de la presencia funciona igual) y el candado no
  aparece. Si la operación lo exige, estandarizar Chrome/Edge en los puestos.
- La API solo reporta activo/inactivo y pantalla bloqueada; no lee teclas,
  mouse ni contenido.
