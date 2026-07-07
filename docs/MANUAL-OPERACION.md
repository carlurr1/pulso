# Pulso · Manual práctico de operación

Guía para el coordinador/superadmin. Cubre lo que se hace seguido: dar de alta
gente, cargar horarios, capacitar sin ensuciar datos, y entender de dónde salen
los números. Escrito para que el proceso no dependa de la memoria de nadie.

---

## 1. Cómo entra un empleado nuevo

Hay **dos subidas independientes** y conviene hacerlas en este orden:

### Paso A — Crear el usuario (su acceso)
`Configuración → Usuarios`. Dos formas:

- **Uno a uno:** botón "Nuevo usuario".
- **Varios de golpe:** botón "Carga masiva" → pegas las filas desde Excel.

**Formato de la carga masiva** (una persona por línea; columnas separadas por
tabulación —al pegar desde Excel— o por coma):

```
Usuario · Nombre · Apellido · Cargo · Rol · Mesa · Código/Cédula
```

- **Usuario**: es lo que la persona escribe para entrar. **Puedes dejarlo vacío**
  y se genera solo (inicial del nombre + primer apellido; ej. *Juan Echeverri →
  JECHEVERRI*; si se repite, le agrega un número). Si prefieres uno específico,
  lo pones tú.
- **Rol**: `agente`, `senior`, `coordinador` o `superadmin` (permisos).
- **Mesa**: el segmento (MAYORISTAS, PREMIUM 1, GOLD…). Debe existir en
  `Configuración → Mesas`.
- **Código/Cédula**: **este es el campo que cruza con los horarios.** Pon aquí la
  cédula (o el código operativo) que aparece en tu Excel de turnos.

Todos entran con contraseña temporal **`Cos2026*`**, que cambian en su primer
ingreso. La carga te muestra el resultado fila por fila (OK / motivo si falló,
ej. "ya existe").

### Paso B — Cargar los horarios
`Configuración → Horarios` → subes el Excel de turnos.

Cada fila del Excel se empareja con la persona **de dos maneras** (usa la
primera que encuentre):
1. Por la columna **"Login"** del Excel contra el **Código/Cédula** del usuario
   (por eso en el Paso A pones la cédula ahí).
2. Si no hay match por código, por **Nombre + Apellido**.

> **Regla de oro:** si en el Paso A pusiste la cédula en *Código/Cédula* y tu
> Excel de turnos trae esa misma cédula en la columna *Login*, todo cruza solo.

El Excel de turnos necesita: una fila de encabezados con **Login**, **Nombre**,
**Apellido**, y por cada día una columna **th** (horas trabajadas, ya sin
almuerzo). Las filas que no cruzan con ningún usuario se reportan como "sin
match" para que sepas a quién le falta crear el acceso.

---

## 2. Capacitar sin ensuciar las métricas

Hay una **mesa oculta llamada PRUEBAS**. Todo usuario en esa mesa —y lo que
haga— queda **fuera de todas las métricas** (KPIs, ranking, carga, En línea,
resumen). No hay que borrar nada después.

- Crea usuarios de capacitación con **Mesa = PRUEBAS** (aparece en el formulario
  y en la carga masiva).
- Capacitas con ellos normalmente; entran con `Cos2026*`.
- El filtro de mesa del tablero **no** muestra PRUEBAS; si algún día quieres ver
  qué se hizo en la capacitación, escribes/seleccionas esa mesa explícitamente.

Ejemplo de filas para la carga masiva:
```
,Capacitacion,Agente1,Agente,agente,PRUEBAS,
,Capacitacion,Senior,Senior,senior,PRUEBAS,
```

---

## 3. Cómo se calculan los números (para explicar a dirección)

- **Efectividad** = casos gestionados ÷ casos asignados (del periodo).
- **Productividad** = tiempo productivo ÷ tiempo neto disponible, tope 100%.
  - **Tiempo neto disponible** = turno − almuerzo − break − **backoffice** −
    **baño**. (Backoffice y baño restan: en ese rato no estaba disponible.)
  - **Tiempo productivo** = gestiones + **capacitación** + **reunión interna**.
    (Capacitación y reunión suman: son funciones que pide ETB.)
  - Ej.: 5 h de gestión + 2 h de capacitación en un turno neto de 7 h = **100 %**.
- **Tiempo en la app / Gestión en el PC**: el primero es tener Pulso abierto; el
  segundo es actividad real de teclado/mouse (Idle Detection). Una brecha grande
  entre ambos = posible inasistencia digital (Pulso la marca solo).
- Las cifras **se recalculan siempre en vivo** desde los datos crudos. Un mes ya
  presentado puede cambiar si se ajusta una fórmula; si necesitas congelar un
  cierre, pídelo (aún no está).

---

## 4. Pausas y su efecto

| Pausa | ¿Cuenta como productivo? | ¿Resta del disponible? |
|---|---|---|
| Break | No | Ya viene descontado del turno |
| Almuerzo | No | Ya viene descontado del turno |
| Baño | No | **Sí** |
| Backoffice | No | **Sí** |
| Reunión interna | **Sí (suma)** | No |
| Capacitación | **Sí (suma)** | No |

Los umbrales de break/almuerzo "fuera de norma" se editan en
`Configuración → Mesas → Normas de pausas`.

---

## 5. Segmentos y subsegmentos (mesas)

- Cada persona pertenece a una **mesa** (MAYORISTAS, PREMIUM 1…).
- Las mesas se agrupan en un **grupo** (PREMIUM agrupa Premium 1–4). El tablero
  filtra por mesa exacta o por "Premium · todo el grupo".
- El **senior** solo ve/reparte dentro de su grupo. El **coordinador** ve todo o
  filtra por segmento.
- **Contenedor general:** si alguien crea un caso de otra mesa, lo envía al
  contenedor de esa mesa; el senior de allá lo asigna a su gente (y en fin de
  semana cualquiera del grupo puede tomarlo).

---

## 6. Comunicación con el equipo

- **Alerta:** mensaje puntual a una persona (le llega al instante). Coordinador y
  senior (a su grupo).
- **Anuncio anclado:** ventana que le sale a todo el equipo (o a una mesa) al
  conectarse y no se quita hasta confirmar. Puedes exigir respuesta escrita y ver
  quién confirmó. Se puede retirar o eliminar.
- **Notificaciones push:** llegan aunque tengan Pulso cerrado (requiere las
  llaves VAPID configuradas en Vercel).

---

## 7. Cada cambio y su SQL (referencia técnica)

Los archivos `supabase/NN_*.sql` se ejecutan **una vez** en Supabase → SQL Editor,
en orden numérico, cuando se despliega el cambio correspondiente. Ya ejecutados
no se repiten. Regla sana: **nada se corre en el SQL Editor que no esté primero
como archivo en `supabase/`** (así el repositorio siempre puede reconstruir la
base).

---

## 8. Cosas que se hacen desde IT (no desde Pulso)

- **Que Pulso solo abra en el equipo corporativo:** se resuelve por red (bloqueo
  por IP/VPN) o por política del navegador administrado — no desde el código.
- **Permiso de medición de tiempo (Idle Detection):** se puede pre-conceder por
  política de Chrome/Edge para que no le pida "Permitir" a cada agente
  (ver `docs/medicion-tiempo-activo.md`).
