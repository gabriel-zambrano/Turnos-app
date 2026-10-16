# DentalDesk · Análisis UX/UI responsive

*06/08/2026 · Qué de los patrones de Reyna Desk conviene traer, qué ya está
resuelto mejor acá, y qué no hay que copiar.*

**Nada de esto está aplicado.** Es un análisis para decidir.

---

## Resumen en una línea

De los diez puntos propuestos, **tres ya existen en DentalDesk**, **dos no
conviene copiarlos** porque lo que hay acá es mejor, y **cinco valen la pena** —
pero el que más impacto tiene no está en la lista: el breakpoint vive en
JavaScript en vez de en CSS, y eso arrastra los demás.

---

## 0. El hallazgo que condiciona todo lo demás

**DentalDesk no usa Tailwind.** El `package.json` no lo tiene: el estilo son 464
líneas de `globals.css` con variables + estilos inline en los componentes.

Todos los patrones citados (`-translate-x-full`, `md:w-56`, `ml-0 md:ml-56`,
`p-4 md:p-8`, `max-w-[480px]`, `backdrop-blur-sm`) son clases de Tailwind. No se
pueden pegar. Hay dos caminos:

| | Instalar Tailwind | Portar el comportamiento a CSS propio |
|---|---|---|
| Esfuerzo | Alto: convive con 12.500 líneas de estilos inline | Bajo: ~80 líneas nuevas en `globals.css` |
| Riesgo | Alto: dos sistemas de estilo compitiendo por especificidad | Bajo |
| Beneficio | Ninguno inmediato | El mismo resultado visual |

**Recomiendo el segundo.** Lo que importa de esos patrones no son las clases,
es la idea: *que el breakpoint lo resuelva el navegador, no React.* Eso se
consigue igual con `@media` propio.

---

## 1. El problema real: el breakpoint está en JavaScript

Esto es lo más importante del documento.

`components/UI.tsx` define:

```ts
export function useIsMobile() {
  const [m, setM] = useState(false)          // ← arranca en false SIEMPRE
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    ...
  }, [])
  return m
}
```

**15 archivos** lo usan, **16 componentes** tienen estado `isMobile`. Las
consecuencias son concretas:

**a) Parpadeo en cada carga desde el teléfono.** El servidor renderiza con
`isMobile = false` porque no conoce el ancho. El paciente/odontólogo ve un
instante el layout de escritorio —con el margen izquierdo de 240px y sin la
barra inferior— y recién en el `useEffect` salta al de móvil. Es el mismo
problema que ya se documentó y resolvió para `--grid-2` en `globals.css`:

> *"Eso además evita el parpadeo de hidratación, donde el servidor pinta la
> versión de escritorio y el cliente salta a la de móvil en la primera pintura."*

La solución ya está escrita en el repo, aplicada a una sola variable. Falta
extenderla al resto.

**b) El desplazamiento del contenido se repite a mano en 20 lugares.**

```tsx
<main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', ... }}>
```

Aparece idéntico en `dashboard`, `agenda`, `pacientes`, `pacientes/[id]`,
`finanzas`, `crm`, `bi`, `equipo`, `facturas`, `configuracion`, `seguimiento`,
`recordatorios`, `admin/tratamientos` — a veces dos o tres veces por archivo
(estado de carga, estado de error, estado normal). Agregar una página significa
acordarse del conjuro. Olvidarlo se ve como contenido tapado por el menú.

El equivalente de Reyna Desk —`ml-0 md:ml-56` en **un** layout— no tiene ese
problema porque el layout es uno solo y la regla es del navegador.

**c) El `Sidebar` renderiza dos árboles distintos.** El `if (isMobile)` de la
línea 130 devuelve una barra inferior flotante completa; el resto del archivo es
el menú lateral. 540 líneas con la lógica de navegación, badges, selector de
clínica, tema y logout **duplicada**. Cambiar un ítem del menú es tocar dos
lugares.

**d) Cada `resize` re-renderiza páginas enteras.** Un cambio de orientación en el
teléfono dispara un re-render de `agenda` (1.974 líneas) completo.

### Qué propongo

1. Un layout de dashboard único (`src/app/(dashboard)/layout.tsx`) que contenga
   `<Sidebar/>` + `<main>`, en vez de que cada página monte su propio `<main>`.
2. El desplazamiento pasa a CSS:
   ```css
   .app-main { margin-left: 0; padding: 1rem; padding-bottom: 90px; }
   @media (min-width: 768px) {
     .app-main { margin-left: var(--sidebar-width, 240px); padding: 2rem; padding-bottom: 1.5rem; }
   }
   ```
   Eso reemplaza los ~20 `marginLeft: isMobile ? ...` y trae de paso la escala de
   padding `p-4 md:p-8` que pedías.
3. `useIsMobile` **no se borra** —hace falta para decidir *qué* renderizar, como
   la barra inferior— pero deja de decidir *dónde* se ubica nada. Y arranca
   leyendo `matchMedia` en el `useState` inicial, no en el `useEffect`.
4. El `Sidebar` se parte en `SidebarDesktop` / `NavMobile` con la lista `NAV` y
   los handlers compartidos, para que dejen de estar duplicados.

**Esto es el 80% del valor de todo el documento y es la única parte que toca
muchos archivos.** Es mecánico, pero son 15 archivos.

---

## 2. Off-canvas vs. barra inferior — acá no copiaría a Reyna Desk

El punto 1 de tu lista pide traer el cajón lateral que se desliza
(`-translate-x-full` → `translate-x-0`) con overlay borroso.

**DentalDesk no tiene cajón: tiene una barra inferior flotante** con los 4
destinos principales + "Más", que abre un bottom sheet. Y eso es **mejor** para
este caso de uso, no peor:

- El odontólogo trabaja con el celular en una mano (está dicho en el comentario
  del `viewport` en `layout.tsx`: *"con una mano"*). La barra inferior está al
  alcance del pulgar; una hamburguesa arriba a la izquierda es el punto más
  lejano de la pantalla.
- Muestra el destino activo permanentemente. El cajón lo esconde.
- No requiere un gesto extra para navegar entre las 4 pantallas más usadas.

Reyna Desk usa cajón porque tiene 12 ítems en 5 grupos con jerarquía; DentalDesk
tiene 12 ítems planos, que es exactamente el caso en que la barra inferior gana.

**Lo que sí traería del patrón de Reyna, aplicado al bottom sheet actual:**

| | Hoy | Propuesta |
|---|---|---|
| Apertura del sheet "Más" | Aparece de golpe, sin transición | Slide-up de 300ms con `cubic-bezier(0.32, 0.72, 0, 1)` |
| Overlay | `backdropFilter: blur(6px)` inline, sin fade | Fade de la opacidad en los mismos 300ms |
| Cierre | Sólo tocando fuera o "Cerrar" | Agregar gesto de arrastre hacia abajo (ya está dibujado el "handle" de 40×4px, pero no hace nada) |
| Safe area | `bottom: 16px` fijo | `bottom: calc(16px + env(safe-area-inset-bottom))` — hoy en iPhone con indicador de home la barra queda pegada al indicador |

El cuarto punto es un bug real en iPhone, no una mejora estética.

---

## 3. Anchos del menú lateral — tampoco copiaría

Tu punto 1.2 propone `w-64` → `md:w-56` (256px → 224px).

DentalDesk ya tiene algo **más sofisticado**: colapsable a 52px con expansión al
pasar el mouse, persistido en `localStorage`, con tooltips cuando está colapsado.
Reyna Desk no tiene nada de eso. Cambiarlo sería un retroceso.

**El único arreglo que necesita** es cómo se escribe el ancho:

```tsx
document.documentElement.style.setProperty('--sidebar-width', isMobile ? '0px' : savedCollapse ? '52px' : '240px')
```

Se ejecuta dentro de un `useEffect` que depende de `isMobile`, así que en la
primera pintura la variable no existe todavía y el `<main>` cae al fallback de
240px — otra fuente del parpadeo del punto 1. Se resuelve escribiendo un
`data-sidebar="collapsed"` en `<html>` desde el script inline que ya está en
`layout.tsx` para el tema, y definiendo el ancho en CSS:

```css
:root { --sidebar-width: 240px; }
html[data-sidebar="collapsed"] { --sidebar-width: 52px; }
@media (max-width: 767px) { :root { --sidebar-width: 0px; } }
```

Sin flash, sin JS en el camino crítico, y de paso desaparece el `isMobile` de
esa decisión.

---

## 4. Portal del paciente — la decisión de producto de este documento

Tu punto 2 propone el "contenedor flotante": una sola columna de `max-w-[480px]`
centrada, con `shadow-2xl`, que en escritorio se ve como un teléfono premium.

**DentalDesk ya es mobile-first y ya usa 480px** — pero sólo hasta 768px. Arriba
de ese ancho cambia a dos columnas y 1024px:

```css
.portal-container { max-width: 480px; }
@media (min-width: 768px) {
  .portal-container { max-width: 1024px; }
  .portal-layout { grid-template-columns: 1.1fr 0.9fr; }
}
```

No está mal hecho. La pregunta es si conviene mantenerlo:

**A favor de pasar a una sola columna (patrón Reyna):**

- El portal se abre desde un link de WhatsApp. Es tráfico de teléfono casi puro.
- Hoy hay **dos** layouts que mantener y testear. El odontólogo previsualiza el
  portal en su escritorio y ve una disposición que ningún paciente ve.
- La versión de dos columnas obliga a decidir qué va en cada columna, y esa
  decisión se desincroniza con el orden de importancia de la versión móvil.

**A favor de dejarlo como está:**

- En una pantalla de 27" una columna de 480px se ve vacía.
- Ya está hecho y funciona.

**Mi recomendación: pasar a una sola columna con marco.** Una columna de 480px
centrada, con `shadow-2xl` y bordes redondeados sobre el fondo, se lee como una
decisión de diseño y no como una página sin terminar. Y elimina la mitad de la
superficie de test del portal. Pero es reversible y es tu llamada.

---

## 5. Punto por punto: qué falta, qué sobra

| Propuesta | Estado en DentalDesk | Qué haría |
|---|---|---|
| **Passwordless por token** | ✅ Ya existe: `/paciente/[token]`, sin login | Nada. Sólo verificaría que el token tenga vencimiento y sea rotable — no lo revisé en este análisis |
| **Confeti / celebración** | ✅ Ya existe: `lib/confetti.ts`, usado en 5 lugares | Nada. Si acaso, *sacar* alguno: hoy se dispara al marcar "asistió" en agenda, cosa que pasa 20 veces por día. Una celebración que ocurre siempre deja de celebrar |
| **Sugerencia contextual por hora** | ✅ Parcial: `obtenerSaludo()` da "Buenos días/tardes/noches" | El equivalente odontológico de "seleccionar la comida según la hora" sería abrir el portal ya posicionado en el próximo turno si es hoy. Es chico y suma |
| **Anillos de progreso SVG** | ❌ Es una barra lineal (`progreso_plan_porcentaje`) | **Vale la pena.** ~40 líneas de SVG, sin tocar datos. Aplica al progreso de ortodoncia en el portal y a los KPIs del dashboard |
| **`capture="environment"`** | ❌ No existe en ningún `<input type="file">` | **Ojo: acá no es una mejora de UX, es una función nueva.** El paciente hoy *no sube fotos* — sólo las ve. El único uploader es el del odontólogo en la ficha (`pacientes/[id]`), y ahí `capture` sería contraproducente: fuerza la cámara y bloquea elegir de la galería o del disco. Si querés que el paciente mande fotos de evolución, es una feature con backend, storage y moderación, no un atributo |
| **Tipografía serif para KPIs** | ❌ Sólo DM Sans (400/500/600/700) | Vale la pena y es lo único del "sistema de diseño" que no es color. Un serif para los números grandes de dashboard, finanzas y BI. Costo: +1 request de fuente; se acota cargando un solo peso y sólo los dígitos |
| **Semáforo empático (sin rojo)** | ⚠️ Mixto | Ver abajo |

### Sobre el rojo

En la app del odontólogo el rojo está bien: un turno cancelado o una deuda
**tienen** que alarmar. Ahí no tocaría nada — y de hecho `#D85A30` ya es un
naranja quemado, no un rojo puro.

Donde sí aplica el criterio es en el **portal del paciente**, que hoy tiene:

```ts
cancelado: { bg: '#F8D7DA', color: '#58151C', label: 'Cancelado' },
```

Rojo hospitalario sobre el turno propio del paciente. Y el error de token
inválido usa `#ef4444` con un ícono de alerta, cuando el mensaje es
simplemente "pedile un link nuevo a tu consultorio".

Propuesta: ámbar cálido (`#EF9F27` / `#633806`, que **ya están** en las
variables `--est-pendiente-*`) para los estados negativos **sólo en las
superficies del paciente**. Cero variables nuevas.

---

## 6. Un problema que encontré y no estaba en la lista

El portal inyecta esto desde un `<style>` dentro de un componente cliente
(línea 1056 de `app/paciente/[token]/page.tsx`):

```css
:root { --portal-bg: #FAF9F6; ... }
body { background-color: var(--portal-bg) !important; ... }
```

Redefine `:root` y pisa el `body` con `!important` a nivel global. Funciona
porque `/paciente/[token]` es una ruta aislada, pero:

- Anula el modo oscuro sin decirlo.
- El bloque se reconstruye en cada render porque interpola los colores del tenant.
- Si alguna vez se embebe el portal en otra pantalla, rompe.

Lo movería a un `layout.tsx` propio de la ruta con las variables del tenant
seteadas en el contenedor, no en `:root`.

---

## 7. Orden propuesto

| # | Bloque | Archivos | Riesgo | Valor |
|---|---|---|---|---|
| 1 | Ancho del sidebar por CSS + `data-sidebar` | 2 | Bajo | Saca el parpadeo del menú |
| 2 | Bottom sheet: transición 300ms + safe-area | 2 | Bajo | Arregla el bug de iPhone |
| 3 | Anillos SVG de progreso | 2-3 | Bajo | Visible, aislado |
| 4 | Rojo → ámbar en el portal | 1 | Bajo | Visible, aislado |
| 5 | Serif para KPIs | 3-4 | Bajo | Cosmético |
| 6 | **Layout único + breakpoint en CSS** | ~15 | **Medio** | **El grande** |
| 7 | Portal a una columna | 1 | Bajo | Depende de tu decisión |
| 8 | Partir `Sidebar` en desktop/mobile | 1 | Medio | Elimina duplicación |

Los primeros cinco son independientes entre sí y se pueden hacer y revertir uno
por uno. El 6 es el que justifica el ejercicio, pero conviene hacerlo cuando no
haya nada a medio terminar en agenda o ficha, porque toca los `<main>` de todas
las páginas.

---

## 8. Lo que NO haría

- **Instalar Tailwind** sólo para copiar estas clases. Ver §0.
- **Reemplazar la barra inferior por el cajón lateral.** Ver §2.
- **Achicar o simplificar el sidebar de escritorio.** Ver §3.
- **`capture="environment"` en el uploader del odontólogo.** Ver §5.
- **Traer la paleta de Reyna Desk.** Ya lo dijiste, pero lo dejo escrito: el
  verde musgo y el crema son de un consultorio de nutrición. DentalDesk tiene
  branding por tenant (`primaryColor` / `secondaryColor` / `accentColor`), que es
  una capacidad que Reyna Desk no tiene y no hay que perder.
