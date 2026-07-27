# Retomar: migración a la maqueta

Nota de traspaso entre sesiones. Bórrala cuando la migración esté cerrada.

## La maqueta manda

`~/Downloads/sistema-de-dise-o-monstruos/project/Sistema de Diseño.dc.html`

**Trabajar leyendo el marcado, no las capturas.** Cada medida (alturas, rellenos,
cuerpos de letra, colores) está literal en los `style=` en línea. Guiarse por las
capturas ya produjo dos rondas de "se acerca, pero no es lo mismo".

Secciones dentro del archivo:

| Líneas | Qué es |
|---|---|
| 578–760 | Armador, tema oscuro |
| 764–944 | Armador, tema claro (mismas medidas, otra paleta) |
| 946–1128 | Detalle de monstruo, oscuro |
| 1130+ | Detalle de monstruo, claro |
| 1318–1500 | Tablas de tokens (`baseTokens`, `typeScale`, `semantic`) |

El `sc-for` es la plantilla de la herramienta: marca listas repetidas.

## Estado

Todas las pantallas están migradas y vistas en navegador, en claro y oscuro:
barra superior, cabecera de pantalla (`PageHeader.astro`), armador, coronas
(la forma dice el tamaño y el color el metal — verificado en `/coronas` y en la
cabecera de un monstruo), iconos de equipo del wiki y `/monstruos/[id]`.

## Decisión pendiente del usuario

La maqueta pone dos botones en la fila de cabecera del armador: **Limpiar** (ya
implementado) y **Cargar objetivo**, que no está porque no se sabe qué debe
cargar — ¿las habilidades de un set guardado? Un botón muerto sería peor.

## Entorno

- `npm run dev` → `localhost:4322`. Usa `node --env-file=.env` porque Astro no
  puebla `process.env` para el código de servidor.
- Mongo local del proyecto en `.mongo-data/` (ignorado por git). El catálogo vive
  ahí, con `_id` `es-419` y `en` — no `es`.
- `npm run test:smoke` corre contra `dist/`: **compilar antes** o se prueba código
  viejo. ~179 comprobaciones.
- Sin contraseña: se genera un enlace de restablecimiento contra la base local
  replicando `/api/auth/forgot` (hash SHA-256 del token como `_id`).

## Convenciones ya asentadas

- Colores solo por token (`bg-0`, `text-2`, `accent`, `line-soft`, `panel-head`,
  `bg-warm`, `accent-deep`, `on-accent`, `chip`, `table-*`). Los alias `base-*` /
  `ember-*` / `jade-*` se retiraron y hay una comprobación que falla si reaparecen.
- Los tres bloques de temas (`:root`, el de `prefers-color-scheme` y
  `[data-theme='dark']`) tienen que declarar **los mismos** tokens: si uno falta
  en el explícito, elegir "oscuro" a mano con el sistema en claro se queda con el
  valor claro. Hay comprobación.
- Un token de color de dato se llama como el dato de la API, no como el concepto:
  `--st-blastblight`, no `--st-blast`, o `affinityTint` cae al gris.
- `.bevel-head` corta solo la esquina superior derecha; `.bevel` las dos opuestas.
- **Un `clip-path` recorta a todos sus descendientes**, incluidos `absolute` y
  `fixed`. Por eso la lista de `Combo.tsx` se dibuja en el `body` con un portal.
  Por lo mismo, un rombo recortado no puede llevar borde de 1 px: quedan cuatro
  motas en las esquinas. Se rellena.
- La barra superior lleva las seis secciones solo desde `xl` (1280 px): medida,
  la fila entera pide 972 px en inglés y 1014 en español, así que en `lg` iba al
  borde. Por debajo se pliega en un `details` sin JavaScript, con Salir dentro.
  El Hunter Name va topado (`max-w-[22ch] truncate`) porque admite 40 caracteres.
- Las páginas con cabecera a sangre pasan `flush` a `Base.astro` y ponen su propio
  relleno (`px-4 py-3.5`). La ficha de monstruo no lleva `PageHeader`: su título
  es el nombre del monstruo y la miga de pan hace de contexto.
- Una isla puede colgar botones en la cabecera con un portal a `#page-actions`.
- Toda retícula de tarjetas o columnas lleva `items-start`: sin él la columna
  corta se estira hasta la larga y deja socavones en blanco.
- La API solo enumera aquello a lo que el monstruo reacciona. Donde eso deje la
  pantalla coja se pinta el repertorio completo (`AFFINITY_VOCABULARY`) y el
  silencio se dice con un guion.
- Al editar con scripts de Python, **poner `assert` antes de `replace`**: un
  `replace` que no encuentra su objetivo falla en silencio, y ya escondió dos veces
  un cambio que parecía aplicado.
