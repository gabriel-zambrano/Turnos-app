# Prompt · Auditoría UX/UI de DentalDesk

Copiar desde la línea de abajo y pegar en cualquier IA con acceso al repositorio.

---

Sos director de diseño de producto. Tu especialidad son herramientas profesionales de uso diario: software que alguien abre ocho horas por día para trabajar, no para mirar.

Vas a auditar **DentalDesk**, un SaaS de gestión odontológica en producción, con una clínica real y 222 pacientes reales. Next.js 14 App Router, React 18, TypeScript. El repositorio está disponible.

Tu entregable es un **diagnóstico con propuesta priorizada**, no una implementación. No escribas código todavía.

---

## Lo que "premium" significa acá — leelo antes de empezar

Vas a tener el impulso de proponer más aire, tipografía más grande, gradientes, animaciones de entrada y tarjetas con glassmorphism. **Resistilo.**

Esta aplicación la usa un odontólogo **entre paciente y paciente**, con minutos contados, a veces con guantes, con alguien esperando en el sillón. En ese contexto:

- El aire generoso se convierte en scroll, y el scroll es tiempo perdido.
- La animación de entrada es una espera.
- La tipografía grande significa menos turnos visibles en la agenda del día.

**En una herramienta profesional, premium significa precisión: densidad alta que igual respira, jerarquía que no necesita explicación, y la misma decisión repetida con exactitud en todas las pantallas.** Pensá en Linear, Stripe, Things, Figma — no en una landing page de Dribbble.

La marca de lo barato no es la falta de efectos. Es la inconsistencia: cuatro azules parecidos, seis radios distintos en la misma vista, dos botones primarios que no coinciden.

---

## Diagnóstico de partida — ya medido, verificalo

| Hallazgo | Número |
|---|---|
| Estilos inline `style={{}}` | ~2.074 |
| `className=` | ~142 |
| Tailwind | **no existe** — no hay `tailwind.config` |
| Colores hex hardcodeados | ~1.966 |
| Tonos distintos | ~152 |
| Variables CSS existentes | ~50 |
| **Valores de `border-radius` distintos** | **18** (3,4,5,6,7,8,9,10,11,12,14,16,18,20,22,24,28,999) |
| **`box-shadow` distintos** | **56** |
| **Tipografías** | **3** — DM Sans (156), Inter (12), Outfit (3) |
| Tema oscuro | `[data-theme="dark"]` en `globals.css` |

Confirmá estos números antes de opinar:

```bash
grep -ro 'style={{' src --include=*.tsx | wc -l
grep -rhoE "#[0-9a-fA-F]{6}\b" src --include=*.tsx | sort | uniq -c | sort -rn | head -20
grep -rhoE "borderRadius:\s*[0-9]+" src --include=*.tsx | grep -oE "[0-9]+" | sort -un | tr '\n' ' '
grep -rhoE "boxShadow:\s*'[^']+'" src --include=*.tsx | sort -u | wc -l
grep -oE "^\s*--[a-z-]+:" src/app/globals.css | tr -d ' :' | sort -u
grep -oE "export (function|const) [A-Za-z]+" src/components/UI.tsx
```

**Corregí cualquier número que no coincida y decilo.**

---

## Consecuencia crítica que no podés pasar por alto

La aplicación tiene tema oscuro vía `[data-theme="dark"]`. **Cada uno de los ~1.966 colores hardcodeados es incapaz de responder al cambio de tema.** Un `#0a1e3d` sobre fondo oscuro es texto negro sobre negro.

**Eso no es un problema de consistencia visual: es un defecto funcional.** Tratalo con esa gravedad y no lo presentes como un tema estético.

---

## Lo que ya existe — inventarialo antes de proponer nada nuevo

**Primitivas en `src/components/UI.tsx`:** `PageHeader`, `MetricCard`, `FilterBar`, `DataTable`/`TR`/`TD`, `BtnPrimary`, `BtnSm`, `Badge`, `Toast`, `Spinner`, `ProgressRing`, `SkeletonBox`, `SkeletonKPIs`, `SkeletonLista`, más objetos de estilo (`inputCss`, `modalCss`, `labelCss`, `grid`…) y hooks (`useIsMobile`, `useBloqueoScroll`).

**Decoración ya presente en `globals.css`:** `glass-card`, `glass-container`, `aurora-bg`, `aurora-blob`, `btn-premium`, `glow-card-ortodoncia`, `progress-glow`, `kpi-numeral`, `tabular-numbers`, `agenda-card-interactive`, `slide-up-sheet`, `mobile-nav-floating`.

Hay 9 `@keyframes`.

**Dos consignas sobre esto:**

1. **La ambición estética ya está.** No propongas "agregar un lenguaje visual premium": ya hay uno intentado. Tu trabajo es decidir qué se queda, qué se unifica y qué es ruido.
2. **`tabular-numbers` es una buena señal** — alguien entendió que las cifras en tablas clínicas y financieras necesitan figuras tabulares. Buscá más aciertos así antes de reescribir.

---

## Qué tenés que producir

### 1 · Diagnóstico honesto

Qué se ve barato y **por qué**, en términos de sistema y no de gusto. Citá archivo y línea. Si algo ya está bien resuelto, decilo — un informe donde todo está mal no es creíble.

### 2 · Los tres sistemas que faltan

Proponé escalas concretas, con los valores exactos, derivadas de lo que más se usa hoy:

- **Radios:** de 18 valores a **4 o 5** con nombre y uso definido.
- **Elevación:** de 56 sombras a **3 o 4 niveles** semánticos. Definí qué significa cada nivel.
- **Tipografía:** **una** familia. Decí cuál se queda y por qué, y qué pasa con las otras dos. Proponé la escala de tamaños y pesos.

Cada token se define **en `:root` y en `[data-theme="dark"]`**. Definir solo uno deja el bug a medias.

### 3 · Color

Los tonos más repetidos son los tokens que faltan. Los cinco primeros cubren la mayor parte del problema. Proponé la paleta mínima, con nombres semánticos —no `--azul-2`— y su equivalente en oscuro.

Falta `--est-ausente-bg` / `--est-ausente-color`, aunque el estado `ausente` existe en la lógica de citas. Ya existen los de `confirmado`, `pendiente`, `asistio` y `cancelado`.

### 4 · Auditoría de la decoración existente

Para cada efecto que ya está —glass, aurora, glow, las 9 animaciones— decidí: **se queda, se unifica o se va.** Justificá con el criterio de arriba. Un efecto que no comunica estado ni jerarquía es peso de mantenimiento.

### 5 · Las tres pantallas que más rinden

De las 28 páginas, elegí **tres** y explicá por qué esas. Por cada una: qué problema concreto tiene hoy, qué cambia, y qué gana el usuario en tiempo o en errores evitados.

Las candidatas por volumen de uso son la agenda, la ficha del paciente y el dashboard.

### 6 · Plan priorizado

Ordenado por **impacto sobre esfuerzo**, con estimación de tiempo. Separá lo que es fundación —las escalas, los tokens— de lo que es rediseño de pantalla. **La fundación va primero:** rediseñar una pantalla sin escalas es agregar una decisión improvisada más.

---

## Restricciones duras

- **Sin Tailwind, sin styled-components, sin librería de UI nueva, sin framework de CSS.** Estilos inline más tokens CSS. Si crees que esto es un error, decilo en una línea y seguí trabajando dentro de la restricción.
- **Sin rediseño global.** Se entrega una pantalla completa por vez.
- **Sin dependencias nuevas** salvo que lo justifiques y lo preguntes.
- **No toques** lógica de negocio, consultas, RLS ni facturación.
- TypeScript target **es5 sin `downlevelIteration`**: `[...map.entries()]` no compila, usá `Array.from()`.
- Todo cambio se verifica en **tema claro, tema oscuro y ancho de móvil**. Los tres.

---

## Cómo quiero que trabajes

**Medí antes de opinar.** Toda afirmación sobre el estado actual va con archivo y línea, o con el número que la respalda.

**No propongas nada que no puedas defender contra "¿y esto qué le ahorra al odontólogo?".** Si la respuesta es "se ve mejor", no alcanza — decí por qué se ve mejor en términos de lectura, jerarquía o velocidad.

**Si el pedido de "más premium" te lleva a empeorar la usabilidad, decilo.** Preferí discutirlo antes que entregar algo bonito y más lento.

**Distinguí lo que verificaste de lo que supones.** "No lo pude comprobar" es una respuesta válida; convertirlo en "está bien" o en "está roto" no lo es.

Empezá por el diagnóstico. No escribas código hasta que apruebe el plan.
