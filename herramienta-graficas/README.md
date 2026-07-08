# Herramienta de gráficas para el comité (por segmento)

Genera, **por segmento**, las imágenes PNG del tablero de comité con el estilo
visual de eTb (el mismo del corte Silver/Bronce que sirvió de guía). Cargas un
Excel con los datos y la herramienta produce las imágenes listas para
**copiar y pegar** en la presentación.

Segmentos objetivo: **Mayoristas, Distrito, Élite, Gold, Premium**
(_Silver/Bronce lo saca otra área; aquí solo se usó como referencia visual_).

## Uso rápido

```bash
# 1) Instalar dependencias (una sola vez)
npm install

# 2) Crear la plantilla de Excel con datos de ejemplo
npm run graficas:plantilla                 # → ./plantilla-comite.xlsx

# 3) Editar el Excel con tus datos reales y generar las imágenes
npm run graficas -- ./plantilla-comite.xlsx ./salida

# (opcional) Autocompletar Ofrecidas/Atendidas/NS/NA/AHT desde el reporte
# diario de llamadas del ACD (formato NS_SOPORTE), sacando el promedio:
npm run graficas -- ./plantilla-comite.xlsx ./salida --llamadas ./NS_SOPORTE.xls
```

Resultado:

```
salida/
  Mayoristas/
    kpis.png                 ← tarjetas de indicadores (atención + operativos)
    evolutivo-semanal.png    ← "Detalle casos falla técnica"
    casos-finales-mes.png    ← "Comportamiento de casos finales por mes"
    desglose-n2.png          ← COFO / OTROS por días + resumen N1/N2
    bolsa-inc.png            ← bolsa de INC en gestión (estado × días)
  Distrito/ …
  Élite/ …
  Gold/ …
  Premium/ …
```

Cada PNG se renderiza a **3x** (nítido al pegar en PowerPoint). Solo abres la
carpeta del segmento, copias la imagen que necesitas y la pegas en la diapositiva.

## Estructura del Excel

Formato "tidy": cada hoja tiene una columna **`Segmento`**; para agregar o quitar
un segmento basta agregar o quitar filas. Los encabezados toleran acentos y
mayúsculas, y cada campo acepta varios alias.

### Hoja `Indicadores` (una fila por segmento)

| Columna | Ejemplo | Notas |
|---|---|---|
| `Segmento` | Mayoristas | |
| `Corte` | 26 de junio de 2026 | texto libre |
| `NivelServicio` | 97,98 | % |
| `NivelAtencion` | 98,75 | % |
| `AHT` | 644,01 | segundos |
| `Ofrecidas` | 401 | |
| `Atendidas` | 396 | |
| `SolicitudesMail` | 641 | |
| `LlamadasAtendidas` | 396 | ratio de contacto |
| `CasosCreadosLlamada` | 206 | ratio de contacto |
| `Resolutividad` | 80,0 | % |
| `TMS` | 6:03:56 | texto hh:mm:ss |
| `TMSTelefonicoN1` | 7:34:21 | texto |
| `TMSCorreoN1` | 5:34:07 | texto |
| `TMSN2` | 10:52:01 | texto |
| `PrimerNivel` | 0 | casos falla técnica N1 |
| `SegundoNivel` | 18 | casos falla técnica N2 |
| `MetaNS` `MetaNA` `MetaResolutividad` `MetaTMS` | 80 · 95 · 78 · 18:00:00 | opcionales (traen valor por defecto) |

El **ratio de contacto** se calcula solo: `LlamadasAtendidas / CasosCreadosLlamada`.

### Hoja `Evolutivo` — línea semanal

| `Segmento` | `Periodo` | `Abiertos` |
|---|---|---|
| Mayoristas | Sem 5 May | 30 |
| Mayoristas | Sem 1 Jun | 29 |

### Hoja `CasosMes` — línea mensual

| `Segmento` | `Mes` | `Casos` |
|---|---|---|
| Mayoristas | ene-26 | 67 |
| Mayoristas | feb-26 | 58 |

### Hoja `Desglose` — COFO / OTROS por días

| `Segmento` | `Categoria` | `Dia` | `Cantidad` |
|---|---|---|---|
| Mayoristas | COFO | 1 | 3 |
| Mayoristas | OTROS | 1 | 7 |

Los días que aparezcan (0, 1, 2, 5, 6, 7…) se detectan automáticamente y se
ordenan; el total por categoría se calcula solo.

### Hoja `BolsaINC` — bolsa de INC en gestión (estado × días)

| `Segmento` | `Estado` | `Dia` | `Cantidad` |
|---|---|---|---|
| Mayoristas | N2 (OTROS) | 1 | 6 |
| Mayoristas | En gestión ASC | 6 | 1 |

Los totales por fila, por columna y el total general se calculan solos.

## Reporte de llamadas del ACD (opcional, `--llamadas`)

El export diario del ACD (formato `NS_SOPORTE`, **una fila por día**) puede
alimentar automáticamente los KPIs de llamadas, para no tener que calcularlos a
mano. La herramienta agrega por campaña y saca el **promedio** de los días con
datos:

| Del reporte | Va a la tarjeta | Cálculo |
|---|---|---|
| `Ofrecidas` | Ofrecidas | promedio diario (redondeado) |
| `Atendidas` | Atendidas | promedio diario (redondeado) |
| `NS` | Nivel de servicio | promedio diario × 100 (%) |
| `NA` | Nivel de atención | promedio diario × 100 (%) |
| `05_tmo` (TMO) | AHT | promedio diario (segundos) |

El **ratio de contacto** usa el *total* de llamadas atendidas del período
(suma), no el promedio.

Cruce por campaña: cada segmento se empata con su campaña usando la columna
`Campaña` de la hoja `Indicadores` (si falta, se empata por el nombre del
segmento). Así, si en `Indicadores` pones `Campaña = Soporte`, ese segmento toma
los números de la campaña "Soporte" del reporte.

```bash
# Ver la agregación (promedio y total) sin generar imágenes:
npm run graficas:llamadas -- ./NS_SOPORTE.xls

# Usar el total del período en vez del promedio:
npm run graficas -- ./datos.xlsx ./salida --llamadas ./NS_SOPORTE.xls --modo total
```

## Cómo funciona (técnico)

- **`crear-plantilla.ts`** — escribe el Excel de ejemplo.
- **`leer-excel.ts`** — lee el libro con `xlsx` y arma un `SegmentoData` por segmento.
- **`leer-llamadas.ts`** — agrega el reporte diario del ACD por campaña (promedios).
- **`plantilla.ts`** — construye el HTML/SVG del tablero con el estilo eTb.
- **`generar.ts`** — renderiza el HTML en Chromium (headless, vía `playwright-core`)
  y recorta cada bloque a PNG a 3x.
- **`llamadas.ts`** — CLI para inspeccionar la agregación de llamadas.
- **`util.ts`** — helpers de lectura de Excel (encabezados flexibles).

No requiere red ni descargar navegadores: usa el Chromium ya instalado en el
entorno. Si necesitas apuntar a otro binario, exporta `PLAYWRIGHT_CHROMIUM`.
