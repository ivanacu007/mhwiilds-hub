# Prompt para Claude Design

Copia todo lo que sigue.

---

Necesito un rediseño visual completo de una aplicación web ya construida y funcionando. No cambies el alcance ni inventes funciones: rediseña lo que existe. Dame un sistema de diseño (tokens, componentes, estados) más las pantallas clave.

## Qué es

Herramienta privada para un grupo de amigos que juegan **Monster Hunter Wilds**. Tres cosas en una:

1. **Armador de sets**: le dices qué habilidades quieres y busca la combinación de armadura, adornos y talismán, **usando solo lo que cada quien posee**. Eso es lo que la diferencia de los armadores públicos.
2. **Registro personal**: inventario, coronas conseguidas por monstruo, cacerías, perfil de cazador.
3. **Gremio**: los miembros se ven entre sí, comparten sets por enlace público.

Es de uso privado, por invitación. No hay marketing ni landing que convierta: la portada solo existe para entrar.

## Restricciones que no se negocian

- **Modo claro y modo oscuro, ambos de primera clase.** Hoy solo existe el oscuro y es el que más se usa —de noche, con el juego al lado o en el celular junto a la consola—, pero el claro tiene que servir igual de bien a plena luz. No quiero un claro que sea el oscuro invertido a la fuerza: cada uno con sus propios valores, y el sistema debe seguir el ajuste del sistema operativo además de permitir cambiarlo a mano.
- **Bilingüe español latino / inglés**, con selector en la barra. Los textos en alemán o francés pueden ser un 30% más largos: nada de anchos fijos calculados sobre el español.
- **Móvil y escritorio por igual.** El inventario se captura sentado en la compu; las coronas y los monstruos se consultan en el celular mientras juegas.
- **Densidad alta.** No es una app de marketing: son tablas y listas largas que se escanean rápido. Prioriza legibilidad y densidad sobre aire y ornamento.
- Stack: Astro + Tailwind 4 + islas Preact. Entrega tokens como variables CSS y clases de utilidad, no un framework de componentes nuevo.

## Volúmenes reales

Esto define el problema: **no es una app de cinco pantallas con diez elementos**.

| Dato | Cantidad |
|---|---|
| Armaduras | 714 |
| Armas | 1188 (14 tipos) |
| Adornos | 361 |
| Materiales | 773 |
| Habilidades | 179 |
| Series de armadura | 194 |
| Talismanes | 64 |
| Monstruos grandes | 34 |

## Pantallas

**Portada `/`** — Sin sesión: qué es y cómo entrar. Con sesión: panel con buscador de materiales (monstruo → material → de dónde sale) y accesos rápidos.

**Entrar / Registro / Restablecer** — Google y correo. Registro por código de invitación.

**Armador `/armador`** — La pantalla principal. Dos columnas: panel izquierdo fijo con las habilidades objetivo (lista completa de 137 agrupada en armadura/arma, filtrable) y el arma opcional (selector de tipo + lista de ~85). Derecha: resultados, cada uno con 5 piezas, adornos colocados, talismán, defensa, ranuras libres y las habilidades logradas. Hasta 8 resultados, cada uno con ~15 datos.

**Inventario `/inventario`** — Cuatro pestañas: adornos (361, con cantidad), talismanes (64, por rango forjado), armaduras (714, marcar poseída), materiales (773, con cantidad). Paginado, con buscador y filtro de "solo lo que tengo". **Es la pantalla más ingrata**: capturar 300 adornos la primera vez. Todo lo que la haga más rápida vale oro.

**Monstruos `/monstruos`** — Los 34 sin paginar, en el orden del juego. Cada uno con icono, especie y todas sus debilidades agrupadas (elemental / estados / efectos, con nivel de 1 a 3 estrellas) más resistencias.

**Detalle de monstruo `/monstruos/[id]`** — Debilidades, hábitats, niveles (normal / frenético / curtido / archicurtido), consejos, **tabla de zonas de impacto** (10 partes × 9 tipos de daño, valores 0–100 coloreados por umbral) y **recompensas** en tarjetas: un material por tarjeta con sus orígenes y probabilidades, con filtro.

**Coronas `/coronas`** — Rejilla de 34 monstruos estilo guía de campo. Cada uno con 4 coronas (pequeña/grande × plata/oro) y contadores de cazados y capturados por nivel de dificultad. Al abrir uno, un diálogo con casillas y contadores.

**Cazadores `/cazadores`** y **perfil `/cazador/[id]`** — Lista del gremio ordenada por coronas. El perfil muestra avatar (un monstruo elegido), HR, Hunter ID, conteo de coronas, cacerías por nivel, favoritos y sets públicos.

**Mis sets `/mis-sets`** y **set público `/set/[slug]`** — Lista con enlace copiable y borrado. La pública se abre sin sesión y debe verse bien al pegarla en WhatsApp o Discord (Open Graph).

**Cuenta `/cuenta`** y **Gremio `/gremio`** — Formularios cortos. El avatar se elige de una rejilla de monstruos con su nivel de dificultad.

## Problemas de UX ya detectados

Resuélvelos en el diseño; son reales, salidos de usarla:

1. **Tablas donde una columna se repite en blanco.** Las recompensas eran una tabla con el nombre del material solo en la primera fila y las demás vacías: no se sabía a qué material pertenecía cada origen. Se pasó a tarjetas. Cuidado con este patrón en zonas de impacto y cacerías.
2. **Listas recortadas con `truncate`.** Las debilidades se cortaban a media línea y escondían justo el dato que se busca. Nada de recortar información en una sola línea cuando hay 8 valores.
3. **Buscar sin poder navegar.** Los selectores solo permitían escribir a ciegas, sin ver qué existe. Todo selector debe dejar explorar la lista completa.
4. **Jerarquía plana en listas mixtas.** Al mezclar debilidades elementales con estados y ordenar por nivel, las elementales desaparecían: los estados son casi siempre nivel 2-3 y las elementales nivel 1. El dato más importante necesita jerarquía propia, no depender del orden.
5. **Paginación donde estorba.** 34 monstruos partidos en páginas iban contra el propósito de verlos todos. Paginar solo lo que de verdad es largo.

## Sistema visual

**Quiero que se parezca a la interfaz de Monster Hunter Wilds.** Ese es el objetivo, no una inspiración lejana: cuando alguien del grupo la abra, debería sentir que es una extensión del juego.

El juego usa dos registros visuales distintos y conviene aprovechar los dos:

**Los menús y el HUD** — paneles oscuros translúcidos sobre el fondo, con desenfoque suave detrás. Bordes finos y claros, esquinas con un pequeño bisel o remate ornamental en vez de radios redondos y blandos. El acento es un **ámbar cálido, casi dorado**, que marca lo seleccionado y lo accionable. La fila activa se resalta con un borde brillante amarillo-verdoso, no con un relleno plano. Los encabezados de sección van sobre una barra angular con una línea fina debajo. Mucho icono y poco texto: cada cosa lleva su símbolo.

**La guía de campo** — pergamino, tipografía con serifa, iconos bordados sobre baldosas de tela, coronas y estrellas como marcas de progreso. Es más ornamental y más cálido.

Cómo repartirlos, aunque tienes libertad para proponer otra cosa:

- El **armazón general** —barra de navegación, paneles, formularios, tablas— sigue el registro de menús: oscuro translúcido, ámbar, bordes finos, remates angulares.
- Las pantallas de **monstruos y coronas** pueden acercarse a la guía de campo, que es literalmente lo que replican: baldosas, serifa en los títulos, las coronas como en el juego.
- El **modo claro no existe en el juego**, así que ahí hay que inventar. La guía de campo es la pista más cercana: pergamino cálido, tinta oscura, el mismo ámbar. Que se reconozca como la misma app y no como un tema aparte.

Hoy la app usa un oscuro neutro azulado con ámbar y verde. Sirve de punto de partida pero es genérico y frío comparado con el juego:

```
base   #0e0f13 #15171d #1c1f27 #242833 #333846 #6b7280 #b6bcc9 #e8eaf0
ámbar  #d97b3a #e89050 #f0a973
verde  #3f9e78 #52b88f
```

### Dónde parar

El parecido no puede costar legibilidad, y aquí es donde hay que traducir en vez de copiar:

- La interfaz del juego se ve **en una tele, a distancia y con mando**. Ésta se usa **de cerca, con ratón o pulgar**, y muestra tablas de 10 filas por 9 columnas. Los elementos del juego son enormes para lo que necesito: conserva el lenguaje visual, no las proporciones.
- **La textura va debajo del texto denso, nunca detrás de él.** Un pergamino con grano bajo una tabla de números cansa a los tres minutos. Úsala en cabeceras, tarjetas y fondos amplios; deja limpias las zonas de datos.
- La translucidez con desenfoque es cara si se apila. Defínela para paneles grandes, no para cada fila.
- El ornamento debe sobrevivir a que un texto mida el doble en alemán: nada de marcos decorativos que dependan de un ancho fijo.

Necesito además:

- **Escala de colores semánticos** para cosas que hoy se codifican por color: coronas de plata y oro, niveles de ranura (1/2/3), rangos de multiplicador de daño (bueno/normal/malo), rareza (1–8), elementos (fuego, agua, rayo, hielo, draco) y estados (veneno, parálisis, sueño, nitro). Donde el juego ya tenga un color para eso, úsalo. Que se distingan **también sin color**: forma, posición o etiqueta.

  **Esto es lo más difícil de los dos temas.** Un dorado que brilla sobre fondo oscuro se vuelve mostaza ilegible sobre blanco, y el verde de "buena zona de impacto" pierde toda su fuerza. Necesito cada color semántico resuelto en ambos modos, no una sola paleta reutilizada. Igual con los iconos de material, que son máscaras monocromas teñidas por dato: el tinte tiene que funcionar sobre los dos fondos.
- **Estados vacíos, de carga y de error** para las listas largas.
- **Densidad de tabla** definida: alto de fila, alineación numérica, tratamiento del scroll horizontal en móvil.
- **Componente de icono teñido**: los iconos de material son máscaras monocromas que se colorean por dato.

## Accesibilidad

- Contraste AA como mínimo en texto y en los indicadores de color, **verificado en los dos modos**: es fácil que un tono pase en oscuro y falle en claro.
- Nada que dependa solo del color: las coronas de plata y oro deben diferenciarse por forma además de por tono.
- Objetivos táctiles usables en móvil, sobre todo los contadores +/− del inventario, que se pulsan cientos de veces.
- Respetar `prefers-reduced-motion` y `prefers-color-scheme`.

## Qué quiero de vuelta

Lo va a implementar otra persona a partir de tu entrega, así que priorizo lo que se puede llevar a código sin interpretar. **Especificaciones antes que maquetas.**

1. **Tokens** de color, tipografía, espaciado, radios y sombras, como variables CSS listas para Tailwind 4, **con su valor en claro y en oscuro**. Di explícitamente cómo se cambia de tema (atributo en la raíz, `prefers-color-scheme`, o ambos).
2. **Los componentes recurrentes**, cada uno con sus estados (normal, hover, foco, activo, deshabilitado, cargando, vacío) y sus medidas concretas: fila de lista densa, tarjeta de monstruo, tarjeta de set, tarjeta de material con orígenes, tabla de zonas de impacto, selector navegable, paginador, contador +/−, indicador de corona, insignia de ranura, barra de navegación con selector de idioma.
3. **Reglas de densidad y disposición**: alto de fila, escala tipográfica, alineación numérica, puntos de quiebre, y qué pasa con las tablas anchas en móvil.
4. **Una explicación corta de las decisiones**: por qué esa paleta, cómo se resuelve la densidad, cómo se distinguen los estados sin color y qué cambia entre claro y oscuro más allá de invertir.
5. **Solo dos maquetas**, para anclar el aire general: el **armador** y el **detalle de monstruo**, cada una en claro y oscuro. Son las que cargan más sistema. El resto se resuelve aplicando los componentes, y prefiero tu criterio escrito a más imágenes.

Si conoces la interfaz de Wilds, apóyate en ella directamente. Si no, búscala: las pantallas de equipo, la guía de campo del monstruo y la caja de objetos son las tres referencias que más se parecen a lo que hace esta app.
