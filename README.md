# Comparador contable

Web sencilla para comprobar que los movimientos de la aplicación de contabilidad coinciden con los del
extracto del banco. Se eligen los dos Excel del mes y la web dice qué coincide, qué falta y qué hay que revisar.

- **Privada**: todo ocurre en el navegador. Los archivos no se envían a ningún sitio, no hay servidor,
  ni cuentas, ni analíticas. La página tiene una Content-Security-Policy que bloquea cualquier conexión externa.
- **No guarda nada**: solo recuerda el tamaño de letra y los colores elegidos (en `localStorage`).
- **Accesible**: 3 tamaños de letra, modo claro, oscuro y alto contraste, todo manejable con teclado.
- **Instalable y sin conexión**: se puede instalar como aplicación y, una vez abierta, funciona sin Internet.

## Cómo usarla

1. Exporta el Excel de la aplicación de contabilidad y el del banco, del mismo periodo.
   Cada uno debe tener 4 columnas en este orden: **fecha, concepto, entradas, salidas**
   (se aceptan `.xlsx`, `.xls` y `.csv`; da igual que haya títulos, filas vacías o totales).
2. Abre la web y arrastra cada archivo a su zona (o pulsa «Elegir archivo…»).
3. Comprueba el mensaje «N movimientos leídos, del … al …» de cada archivo.
4. Revisa las tarjetas de resumen y la tabla por fecha. Pulsa una fecha para ver sus movimientos lado a lado.
5. Si quieres guardarlo, pulsa **Exportar a Excel**.

Para probarla sin archivos propios, pulsa **Probar con datos de ejemplo**, o usa los dos Excel de la carpeta
[`ejemplos/`](ejemplos/).

## Instalarla como aplicación

La web se puede instalar como una aplicación más del ordenador (con su propio icono y ventana). Una vez
instalada, o simplemente abierta una vez, **funciona sin conexión**: la web completa, incluida la librería
de Excel, queda guardada en el ordenador. Los archivos de Excel siguen sin salir del ordenador.

- **Chrome**: pulsa el botón **Instalar la aplicación** de la cabecera, o el icono de instalar ⊕ que aparece
  a la derecha de la barra de direcciones (también en el menú ⋮ › *Transmitir, guardar y compartir* ›
  *Instalar página como aplicación*).
- **Edge**: el botón **Instalar la aplicación**, o el menú ⋯ › *Aplicaciones* › *Instalar este sitio como aplicación*.
- **Safari (Mac, Safari 17 o superior)**: menú **Archivo › Añadir al Dock**. La web muestra esta nota cuando
  detecta Safari.

El botón *Instalar la aplicación* solo aparece cuando el navegador permite instalarla y desaparece cuando
ya está instalada. Para desinstalarla: en Chrome o Edge, abre la aplicación y usa el menú ⋮ › *Desinstalar*;
en Mac, arrástrala desde el Dock o desde la carpeta Aplicaciones a la papelera.

### Cómo se actualiza

Cada vez que se abre, la web comprueba (si hay conexión) si hay una versión nueva; si la deja abierta,
lo comprueba también cada hora. Si la hay, aparece abajo a la derecha el aviso **«Hay una versión nueva.
Actualizar»**. No interrumpe: se puede seguir trabajando y pulsar *Actualizar* (o *Más tarde*) cuando se
quiera. Al actualizar se recarga la página, así que hay que volver a elegir los archivos. La versión
instalada se ve al pie de la página.

## Ejecutarla en tu ordenador

Es una web estática: no hace falta instalar nada salvo para servirla. Los módulos JavaScript no funcionan
abriendo `index.html` con doble clic (`file://`), así que hay que usar un servidor local cualquiera:

```bash
node scripts/servidor.mjs
```

y abre <http://localhost:8080>. (Alternativa sin Node: `python -m http.server 8080`.)

Requiere [Node.js](https://nodejs.org) 18 o superior solo para el servidor local, los tests y el generador de ejemplos.

```bash
npm test
```

```bash
npm run ejemplos
```

`npm test` ejecuta los tests automáticos (`node --test`) y `npm run ejemplos` regenera los dos Excel ficticios de `ejemplos/`.

## Cómo funciona el emparejado

Cada movimiento se convierte en un importe con signo (entrada = +, salida = −) en **céntimos enteros**,
así que una entrada de 100 € nunca se empareja con una salida de 100 €. Las fechas se manejan como días
"planos" (sin hora ni zona horaria) para evitar desfases de un día.

Cada movimiento se empareja **como máximo con uno** del otro archivo. Se aplican estas pasadas en orden; si hay
varios candidatos se elige el de menor diferencia de días, luego el de concepto más parecido, luego el primero
en el orden original del archivo:

| Pasada | Importe | Días de diferencia | Concepto | Resultado |
|---|---|---|---|---|
| 1 | igual | 0 | parecido | **Coincide** |
| 2 | igual | 1 a 2 | parecido | **Coincide** («Fecha desfasada N días») |
| 3 | igual | 0 a 2 | distinto | **Dudoso**: concepto distinto |
| 4 | distinto, mismo signo | 0 a 2 | parecido | **Claro**: importe distinto (se muestra la diferencia) |
| 5 | igual | 3 a 31 | parecido | **Dudoso**: fecha muy distinta |
| 6 | lo que sobra | | | **Claro**: falta en el banco / falta en contabilidad |

En la pasada 6, si el movimiento cae a menos de 2 días del principio o del final del periodo del otro archivo
(o fuera de él), se marca como **Dudoso: puede caer fuera del periodo**. Si en el otro archivo queda un
movimiento sin emparejar con el mismo importe, se muestra como pista.

**Concepto parecido**: se pasa a minúsculas, se quitan tildes, números y signos de puntuación, y se comparan
las palabras. El parecido es la proporción de palabras del concepto más corto que aparecen en el otro
(se acepta una abreviatura de 4 letras o más, como «transf» → «transferencia»). Se ignoran palabras vacías
(«de», «la»…) y palabras genéricas de banca («recibo», «transferencia», «compra», «tarjeta», meses…), salvo que
un concepto se quede sin palabras. Es parecido si llega al umbral (0,5 por defecto).

**Descuadre total** = neto de contabilidad − neto del banco. **Primera fecha con descuadre** = la primera fecha
con algún movimiento en desfase claro o dudoso.

## Constantes configurables

Están todas en [`js/config.js`](js/config.js):

| Constante | Valor | Para qué sirve |
|---|---|---|
| `MARGEN_DIAS` | 2 | Días de diferencia admitidos para «mismo momento» y margen de los bordes del periodo |
| `VENTANA_MAX_DIAS` | 31 | Máximo de días para la pasada «fecha muy distinta» |
| `UMBRAL_CONCEPTO` | 0,5 | Parecido mínimo de concepto (0 a 1) |
| `LONGITUD_MIN_PALABRA` | 2 | Palabras más cortas no cuentan |
| `LONGITUD_MIN_PREFIJO` | 4 | Longitud mínima para aceptar abreviaturas (0 = desactivado) |
| `PALABRAS_VACIAS` | … | Palabras que nunca cuentan |
| `PALABRAS_GENERICAS` | … | Palabras de banca que se ignoran si hay otras |
| `ANIO_MIN`, `ANIO_MAX` | 1990, 2100 | Años válidos (evita tomar importes por fechas) |
| `MAX_FILAS`, `MAX_BYTES` | 100 000, 30 MB | Límites de seguridad de lectura |

## Lectura de archivos

- Un único lector para los dos archivos ([`js/lector.js`](js/lector.js) y [`js/filas.js`](js/filas.js)).
- La columna de fecha se detecta sola (la primera columna con fechas); la tabla no tiene que empezar en la
  fila 1 ni en la columna A. Si justo detrás hay otra columna de fechas (fecha valor), se salta: se usa la fecha contable.
- Fechas: número de serie de Excel (también libros con sistema 1904), objetos fecha y texto `dd/mm/aaaa`
  (también `dd-mm-aa`, `dd.mm.aaaa` y `aaaa-mm-dd`).
- Importes: números, celdas vacías y texto español (`1.234,56`, `-12,30 €`, `(45,00)`). Un texto como `1.234`
  se interpreta como mil doscientos treinta y cuatro.
- Se ignora toda fila sin fecha válida, las filas sin importe y las filas de saldo o total aunque tengan fecha.
- Si el libro tiene varias hojas, se usa la que más movimientos tenga.
- CSV: separador `;`, `,` o tabulador detectado automáticamente; codificación UTF-8 o Windows-1252.

## Estructura

```
index.html                 Página única
css/estilos.css            Estilos (temas, tamaños de letra, impresión)
js/config.js               Constantes configurables
js/valores.js              Fechas, importes y formato
js/filas.js                Filas de una hoja → movimientos
js/lector.js               Lectura de .xlsx/.xls/.csv
js/concepto.js             Parecido de conceptos
js/emparejado.js           Algoritmo de emparejado
js/resumen.js              Resumen, tabla por fecha, filtros y etiquetas
js/exportar.js             Exportación a Excel
js/app.js                  Interfaz
js/pwa.js                  Instalación, service worker y aviso de versión nueva
sw.js                      Service worker (caché sin conexión, CACHE_VERSION)
manifest.json              Manifest de la aplicación instalable
img/                       Iconos (generados con scripts/generar-iconos.mjs)
js/ejemplo.js              Generador de datos ficticios
vendor/sheetjs/            SheetJS Community Edition 0.20.3 (licencia Apache 2.0), incluido en el repositorio
scripts/                   Servidor local, generadores de ejemplos e iconos, y preparación de la publicación
tests/                     Tests automáticos (node --test)
ejemplos/                  Dos Excel ficticios para probar
```

Preparado para ampliar: `conciliar()` ya acepta `paresManuales` (emparejado manual) y parámetros propios,
y toda la lógica es independiente de la interfaz (para añadir historial o varias cuentas más adelante).

## Aplicación instalable (PWA)

- [`manifest.json`](manifest.json): nombre, idioma, colores e iconos. `start_url` y `scope` son relativos
  (`./`), así que funciona tanto en la raíz de un dominio como en una subruta.
- [`sw.js`](sw.js): service worker. Precachea toda la web (lista `ARCHIVOS`) con la estrategia *caché primero*,
  borra las cachés antiguas al activarse y sirve la página principal en cualquier navegación sin conexión.
  La versión nueva no se activa sola: espera a que se pulse *Actualizar*.
- [`js/pwa.js`](js/pwa.js): registro del service worker, aviso de versión nueva y botón de instalar.
- Los iconos (`img/icono-192.png`, `img/icono-512.png`, `img/icono-maskable-*.png` y
  `img/apple-touch-icon.png`) se generan con `node scripts/generar-iconos.mjs`, sin dependencias.

## Publicar en Cloudflare Pages

La web se publica gratis en Cloudflare Pages, con una dirección corta del tipo
`https://<nombre-del-proyecto>.pages.dev` (el nombre lo eliges tú al crear el proyecto) y HTTPS, que es
obligatorio para poder instalarla y usarla sin conexión.

Solo se publica lo necesario: `node scripts/preparar-publicacion.mjs` (o `npm run publicar`) crea la carpeta
`publicar/` con los archivos de la web (la misma lista `ARCHIVOS` de `sw.js`) y un archivo `_headers` con
cabeceras de seguridad (la misma Content-Security-Policy de `index.html`, más `frame-ancestors 'none'` para que
nadie pueda incrustar la web). Los tests, los scripts, el README y los Excel de ejemplo no se publican.

> **Elige bien el nombre del proyecto antes de que nadie instale la aplicación.** Si la dirección cambia
> después, el navegador la trata como otra aplicación y hay que volver a instalarla.

### Opción A (recomendada): conectada a un repositorio de GitHub

Cada vez que subas cambios a GitHub, Cloudflare publica la versión nueva sola. El repositorio puede ser privado.

1. Crea un repositorio **privado** en GitHub y sube esta carpeta (la carpeta `publicar/` no hace falta: está en `.gitignore`).
2. En el panel de Cloudflare: **Workers & Pages → Create application → Pages → Connect to Git**,
   autoriza a Cloudflare a ver ese repositorio y elígelo.
3. Configuración de la compilación:
   - **Project name**: el nombre que quieras para la dirección (por ejemplo `comparador` → `comparador.pages.dev`).
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: `node scripts/preparar-publicacion.mjs`
   - **Build output directory**: `publicar`
4. Pulsa **Save and Deploy**. En uno o dos minutos estará en `https://<nombre>.pages.dev`.

### Opción B: subir la carpeta a mano

Sin GitHub. Pero ten en cuenta que un proyecto creado así **no se puede conectar después a Git**: cada
actualización hay que volver a subirla a mano.

1. Ejecuta `npm run publicar` para crear la carpeta `publicar/`.
2. En Cloudflare: **Workers & Pages → Create application → Pages → Upload assets**, ponle nombre al proyecto
   y arrastra la carpeta `publicar/`.
3. Para actualizar: vuelve a ejecutar `npm run publicar`, entra en el proyecto, **Create new deployment** y
   arrastra otra vez la carpeta.

Los nombres de los menús de Cloudflare cambian de vez en cuando; si no encuentras alguno, busca
«Pages» dentro de *Workers & Pages*.

### Subir una versión nueva

1. Haz los cambios y comprueba que los tests pasan (`npm test`).
2. Si has añadido, quitado o renombrado archivos de la web, actualiza la lista `ARCHIVOS` de [`sw.js`](sw.js)
   (los tests avisan si falta alguno). Esa lista decide también qué se publica.
3. **Cambia `CACHE_VERSION`** al principio de [`sw.js`](sw.js), por ejemplo de `'2026-10-31.1'` a
   `'2026-11-15.1'`. Sin este cambio, quien ya tenga la web instalada seguirá viendo la versión anterior,
   porque se sirve desde la caché.
4. Opción A: sube los cambios a la rama `main`. Opción B: vuelve a subir la carpeta `publicar/`.
   La próxima vez que se abra la web con conexión aparecerá el aviso «Hay una versión nueva. Actualizar».

Para probar en local exactamente lo que se va a publicar: `npm run publicar` y después
`node scripts/servidor.mjs 8081 publicar` (abre <http://localhost:8081>). El servidor local no aplica las
cabeceras de `_headers`; Cloudflare sí.

### Alternativa: GitHub Pages

También funciona en GitHub Pages sin cambios (rutas relativas y archivo `.nojekyll`), pero la dirección
lleva tu usuario (`https://<usuario>.github.io/<repositorio>/`) y, en el plan gratuito, el repositorio tiene
que ser público. Se activa en **Settings → Pages → Deploy from a branch** (`main`, carpeta raíz).
