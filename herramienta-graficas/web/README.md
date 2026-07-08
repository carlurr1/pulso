# Tablero de comité — herramienta web (`tablero.html`)

Página **autónoma** (un solo archivo) para generar el tablero del comité por
segmento cada semana, sin instalar nada. Trae SheetJS y el logo eTb incrustados;
funciona **offline** (no necesita internet).

## Cómo usarla

1. Abre `tablero.html` con doble clic (Chrome/Edge). También sirve por GitHub Pages.
2. Sube los archivos de la semana:
   - **Semáforo de soporte** → indicadores operativos por segmento (Resolutividad, TMS).
   - **Bolsa de INC** (`Bolsa_*.xlsx`) → tabla de INC en gestión (OTROS).
   - **Base de clientes** → clasifica la bolsa por segmento (NIT → `AGENTE_SEGUIMIENTO`).
   - **Llamadas (ACD)** (`NS_SOPORTE.xls`) → indicadores de atención (general).
   - **Datos base** (opcional) → hojas `Evolutivo` / `CasosMes` / `Desglose`.
3. Completa los campos manuales: **Corte**, **Solicitudes Mail**, **Casos creados por llamada**.
4. **Generar tablero** → aparece el tablero por segmento.
5. Botón **PNG** en cada bloque (o **Descargar todas**) → imágenes listas para pegar en la presentación.

## Reglas de cálculo (resumen)

- **Atención** (llamadas): NS/NA/AHT = promedio diario; Ofrecidas/Atendidas = total del período.
- **Operativos** (semáforo, **Sin COFO**): Resolutividad = `%SNU` y TMS = "Promedio de TMS"
  leídos de las hojas `SN1`/`TMS`; el desglose Telefónico/Correo N1 y Nivel 2 se calcula de `BBDD`.
- **Metas por segmento**: Resolutividad y TMS por segmento (definidas en el objeto `METAS` del HTML);
  NS 80% / NA 95% generales.
- **Bolsa**: `RESPONSABLE = OTROS`, filas por `ESTADO`, columnas por `DIAS_ABIERTO`;
  segmento por NIT (base de clientes → respaldo semáforo).

## Ajustes

Toda la lógica y el estilo están en el mismo `tablero.html` (sección `<script>`).
Para cambiar metas, colores, textos o reglas, se edita ese archivo. Es la versión
equivalente al CLI de la carpeta superior (`npm run graficas`), pensada para uso
semanal sin terminal.
