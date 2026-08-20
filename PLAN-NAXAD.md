# Plan Naxad — empresa, infraestructura y salida al mercado

**Fecha:** 30/07/2026
**Premisa:** llegar a facturar sin poner plata que no tenés. Todo lo que sigue
está pensado para arrancar con **menos de USD 50/mes** y que cada gasto nuevo lo
pague un cliente que ya firmó, no una proyección.
**Foco elegido:** DentalDesk como producto principal. Naxad es la marca paraguas.

---

## 0. La decisión que ordena todo lo demás

Hoy DentalDesk corre sobre `walterbenegas.com.ar`. Eso significa que la
plataforma y el primer cliente comparten dominio. No podés vender así: el
segundo odontólogo no va a poner sus pacientes en el dominio de un colega, y
—como ya documentaste en `DECISIONES-PRODUCTO.md`— la superposición esconde bugs
de multi-tenant.

**Primer hito, antes que cualquier otra cosa: separar los dominios.**

```
naxad.com.ar          → sitio de la empresa (2 páginas, estático)
dentaldesk.com.ar     → landing + app del producto
  app.dentaldesk.com.ar        panel del odontólogo
  <clinica>.dentaldesk.com.ar  portal público de cada clínica
walterbenegas.com.ar  → queda como dominio propio del Dr. Benegas (cliente #1)
```

Costo: dos dominios `.com.ar` ≈ ARS 6.000/año cada uno en NIC.ar. Es el gasto
con mejor retorno de toda esta lista.

Hasta que eso no esté hecho, cada venta nueva te agrega deuda.

---

## 1. Naxad como empresa

### 1.1 Figura fiscal

**Recomendación: monotributo a tu nombre. No armes SRL ni SAS todavía.**

Una SAS te cuesta constitución, contador mensual, balances y IIBB antes de tener
el primer peso de ingreso. Con 5 clientes no lo justifica nada. El monotributo
te deja facturar legalmente, que es lo único que necesitás para cobrar.

Números de referencia (**verificá con tu contador, ARCA actualiza cada 6 meses**;
la última recategorización general fue de ~17% en julio 2026):

| Categoría | Cuota mensual aprox. (servicios, ago-2026) | Te sirve hasta |
|---|---|---|
| A | ~ARS 49.500 | los primeros meses |
| B | ~ARS 56.400 | ~8-10 clínicas |
| C | ~ARS 66.000 | ~15-20 clínicas |

Cuándo saltar a SAS: cuando (a) sumes un socio, (b) superes el tope de
monotributo, o (c) un cliente corporativo te exija facturar como sociedad.
Ninguna de las tres pasa en los próximos 6 meses.

### 1.2 Cobro

Ya tenés MercadoPago con suscripciones (`preapproval`) integrado y el webhook
verificando firma. Eso es lo correcto para Argentina: débito automático mensual,
sin que el odontólogo tenga que acordarse de pagar.

Lo que falta operativamente:

- **Facturar tus propias suscripciones.** Ironía del proyecto: tenés facturación
  electrónica ARCA en producción para tus clientes, pero no emitís factura por
  DentalDesk. Un monotributista puede emitir factura C desde el portal de ARCA a
  mano — con 5 clientes, 15 minutos por mes. Cuando sean 20, reusá el módulo
  ARCA que ya escribiste, apuntándolo a tu propio CUIT.
- **Recibo automático por mail** al cobrarse la suscripción. Ya tenés Resend
  configurado; es un template más.

### 1.3 Lo legal que no podés saltear (SaaS de salud)

Estás procesando datos de salud de terceros. Bajo la Ley 25.326 son **datos
sensibles**, y la Ley 26.529 obliga a conservar historias clínicas 10 años.

Mínimo indispensable, en orden:

1. **Términos y Condiciones + Política de Privacidad** publicados. Ya tenés
   `src/app/legal/`; revisá que digan quién es el responsable del tratamiento
   (el consultorio) y quién el encargado (Naxad).
2. **Contrato de Encargado de Tratamiento** con cada clínica. Es un anexo de 2
   páginas al T&C: la clínica es dueña de los datos, vos los procesás en su
   nombre, no los usás para otra cosa, los devolvés y borrás si se va. Sin esto,
   cualquier problema de un paciente te cae a vos directo.
3. **Registro de la base de datos** ante la Agencia de Acceso a la Información
   Pública. Es un trámite online, gratis. Poca gente lo hace y es exactamente lo
   que te piden si algún día hay un reclamo.
4. **Cláusula de exportación de datos**: qué pasa si la clínica se va. Prometé
   un export completo (ya lo tenés implementado, multi-hoja) y decilo en el T&C.
   Es argumento de venta, no solo cumplimiento: elimina el miedo al lock-in.

Costo estimado: una consulta con abogado para revisar el T&C y el anexo,
ARS 150.000–250.000 una vez. Si no lo podés pagar ahora, arrancá con plantillas
y ponelo en el mes 3 — pero ponelo.

### 1.4 Marca

Naxad como paraguas, DentalDesk como producto. No al revés: el odontólogo compra
"DentalDesk", no "Naxad". Naxad aparece en la factura, el contrato y el footer.

Identidad mínima (hacela vos, no contrates): logo tipográfico, 2 colores, 1
tipografía. Ya tenés una paleta funcionando en la app (`#0a1e3d`, `#185FA5`,
`#138A6B`) — usá esa. Coherencia gratis.

---

## 2. Dónde vivir: infraestructura

### 2.1 Lo que tenés hoy y qué pasa si lo dejás así

| Servicio | Plan actual | Problema |
|---|---|---|
| Vercel | Hobby (gratis) | **Prohíbe el uso comercial.** Ya cobrás. Estás en violación de términos. |
| Supabase | Free | **Sin backups. Pausa el proyecto tras 7 días sin actividad.** 500 MB. |
| Resend | Free | 3.000 mails/mes, 100/día. Alcanza para ~10 clínicas. |
| Sentry | Free | Con `tracesSampleRate: 1` la quemás en semanas (ver auditoría). |

Los dos primeros no son opinables. Vercel Hobby excluye explícitamente cualquier
despliegue vinculado a una ganancia económica, y Supabase Free no hace ninguna
copia de respaldo de una base con historias clínicas que la ley te obliga a
conservar 10 años.

### 2.2 Stack recomendado — USD 45/mes

| Servicio | Plan | USD/mes | Por qué |
|---|---|---|---|
| **Supabase** | Pro | 25 | Backups diarios (7 días), 8 GB, sin pausas, soporte |
| **Vercel** | Pro | 20 | Uso comercial habilitado, analytics, más límites |
| Resend | Free | 0 | 3.000 mails/mes; pasás a USD 20 recién en ~15 clínicas |
| Sentry | Free | 0 | Con sampling al 10% (ver auditoría) rinde meses |
| Upstash Redis | Free | 0 | 10.000 comandos/día para el rate limit |
| Dominios | NIC.ar | ~1 | ARS 12.000/año por los dos |
| **Total** | | **~46** | ≈ ARS 62.000/mes |

**Punto de equilibrio: 3 clínicas en plan Pro fundador** (ARS 24.900 × 3 =
ARS 74.700). Con el cliente que ya tenés, te faltan dos.

### 2.3 Si USD 45 hoy es mucho — variante USD 30

Bajá Vercel, nunca Supabase. Los backups no son negociables en una app de salud.

| Servicio | Plan | USD/mes |
|---|---|---|
| Supabase | Pro | 25 |
| VPS Hetzner CX22 (2 vCPU, 4 GB) con Coolify o Docker | | ~5 |
| **Total** | | **~30** |

Contra: perdés deploy automático desde git, edge network, y te comprás el
mantenimiento del servidor (parches, certificados, uptime). Vas a gastar 4-6 h
por mes en ops. **A ARS 20.000/mes de diferencia, ese tiempo vale mucho más
puesto en vender.** Usá esta variante solo si el flujo de caja no da otra.

### 2.4 Lo que hay que hacer sí o sí, cueste lo que cueste

1. **Backups.** Con Supabase Pro ya vienen. Igual configurá un `pg_dump` semanal
   a Google Drive: el backup del proveedor no te salva si perdés la cuenta.
2. **Probar la restauración.** Un backup que nunca restauraste no es un backup.
   Una vez, restaurá a un proyecto Supabase de prueba y verificá que la app
   levanta. Anotá los pasos en un `RUNBOOK-BACKUP.md`.
3. **Monitoreo de caída.** UptimeRobot free: 50 monitores, chequeo cada 5 min,
   alerta por mail. Te enterás vos antes que el odontólogo.
4. **Página de estado.** Cuando tengas 5 clientes, un `status.dentaldesk.com.ar`
   estático evita 5 llamados en cada incidente.

### 2.5 Lo que NO necesitás (y te van a querer vender)

- Kubernetes, Docker Swarm, multi-región. Con 20 clínicas, Vercel + Supabase te
  sobra por 10x.
- CDN aparte. Vercel ya es una CDN.
- Base de datos dedicada por cliente. Tu RLS ya resuelve el aislamiento y está
  bien hecho. Una base por cliente te multiplicaría el trabajo de migraciones
  por N.
- Un CRM pago. Una planilla de Google con 6 columnas te alcanza hasta 50 leads.

---

## 3. Landing page de DentalDesk

### 3.1 Decisión técnica

**Hacela dentro del mismo proyecto Next.js**, en `src/app/(marketing)/page.tsx`,
como Server Component estático. No la hagas en Framer, Webflow ni WordPress.

Razones concretas:

- Ya tenés `/precios` leyendo de `src/lib/planes.ts`. La landing debe leer de ahí
  también: cambiás un precio en un archivo y se actualiza en los dos lados. Con
  una landing externa, en el tercer aumento por inflación vas a tener precios
  contradictorios.
- El signup ya vive en la app (`RegistroWizard`). Landing y registro en el mismo
  dominio = cero fricción, cero problemas de cookies.
- Costo adicional: USD 0.
- Como Server Component estático arregla de paso el LCP de 80 que anotaste en
  `ESTADO-PROYECTO.md`.

### 3.2 Estructura, sección por sección

**1 · Hero**
- H1: *El sistema de gestión que tu consultorio necesita, sin planillas ni WhatsApp perdidos.*
- Subtítulo: *Agenda, ficha clínica con odontograma, facturación electrónica ARCA
  y recordatorios automáticos. Hecho en Argentina, para consultorios argentinos.*
- CTA primario: **Probar 14 días gratis** (sin tarjeta)
- CTA secundario: *Ver una demo de 3 minutos*
- Visual: captura real de la agenda. **Nunca un mockup genérico de stock.**

**2 · Barra de prueba social**
- *En uso todos los días en consultorios de Argentina.*
- Con un solo cliente, no inventes logos. Cuando el Dr. Benegas te dé un
  testimonio con nombre y foto, ese solo testimonio vale más que diez logos
  falsos.

**3 · El problema (3 columnas)**
- *"¿Cuántos turnos perdiste este mes porque el paciente se olvidó?"*
- *"¿Cuánto tardás en armar la factura de cada paciente?"*
- *"¿Dónde está la ficha de un paciente que vino hace dos años?"*

**4 · Las 6 features, con foco en el resultado, no en la función**

| Feature | Titular orientado a resultado |
|---|---|
| Recordatorios automáticos | *Menos ausentes, sin mandar un solo WhatsApp a mano* |
| Facturación ARCA | *Factura electrónica con validez fiscal, en dos clics* |
| Ficha clínica + odontograma | *Toda la historia del paciente en una pantalla* |
| Portal del paciente | *Tu paciente ve su turno y su plan sin llamarte* |
| Consentimientos con firma digital | *Firma en pantalla, con validez legal (Ley 26.529)* |
| Analítica del consultorio | *Sabés qué días tenés la agenda vacía, y por qué* |

Cada una: un ícono, tres líneas de texto, una captura real. Sin párrafos.

**5 · Objeciones, respondidas de frente**
- *"¿Y si me quiero ir?"* → Exportás todo a Excel cuando quieras. Los datos son tuyos.
- *"¿Es difícil de aprender?"* → Cargamos tus pacientes desde tu Excel actual. En una tarde estás andando.
- *"¿Mis datos están seguros?"* → Cada consultorio ve solo lo suyo, aislado a nivel de base de datos. Backups diarios.
- *"¿Sirve en el celular?"* → Se instala como app desde el navegador. Sin App Store.

**6 · Precios**
- Las tres columnas de `planes.ts`, con **Pro destacado**.
- Banner de escasez honesta: *Precio Fundador para los primeros 20 consultorios.
  Quedan N.* (Ya tenés `CUPO_FUNDADORES = 20`; mostrá el número real desde la
  base, no uno inventado.)
- Anclaje explícito, que ya está escrito en tus comentarios de `planes.ts` y es
  buenísimo: *Menos que una consulta particular. Si te evita un solo ausente al
  mes, ya se pagó.*

**7 · FAQ** — 8 preguntas. Es tu mejor activo de SEO: cada pregunta puede
posicionar sola.

**8 · CTA final + footer** con Naxad, datos fiscales, links legales.

### 3.3 SEO — la ventaja que nadie está tomando

Tu mercado busca en español rioplatense y la competencia local es floja. Términos
con intención de compra y poca pelea:

- `software para consultorio odontológico argentina`
- `sistema de gestión odontológica`
- `facturación electrónica para odontólogos` ← **acá tenés ventaja real**:
  ARCA integrado y funcionando es algo que casi nadie ofrece
- `agenda online para dentistas`
- `historia clínica digital odontología`

Tres artículos de blog que te van a traer leads durante años:

1. *Cómo facturar electrónicamente en ARCA siendo odontólogo (guía 2026)*
2. *Cuánto te cuesta realmente cada paciente que no viene*
3. *Historia clínica digital: qué exige la Ley 26.529 en Argentina*

El primero es el más valioso: quien lo busca tiene un problema urgente que tu
producto resuelve, y llega en el momento exacto de la decisión.

Técnico: `metadata` de Next en cada página, Open Graph, `sitemap.ts`,
`robots.ts`, y JSON-LD `SoftwareApplication` con los precios.

---

## 4. Cómo conseguir los primeros 10 clientes

Con presupuesto cero, olvidate de Google Ads (el clic en este nicho no baja de
ARS 800 y necesitás ~40 clics por venta). Los primeros 10 se consiguen a mano.

### Canal 1 — El Dr. Benegas (el más importante, y es gratis)

Tu cliente actual es odontólogo, tiene colegas, y el producto le funciona. Pedile:

1. Un testimonio en video de 60 segundos con el celular. Uno solo alcanza.
2. Tres nombres de colegas a quienes les sirva.
3. Que te deje mostrar su consultorio como caso real (con permiso escrito).

Un odontólogo recomendando a otro convierte 10 veces mejor que cualquier anuncio.
Ofrecele 3 meses gratis por cada colega que se suscriba: te cuesta ARS 0 en
efectivo y te trae clientes calificados.

### Canal 2 — Prospección directa (20 por semana)

Google Maps → "odontólogo" en tu ciudad → filtrar los que tienen web propia o
Instagram activo (señal de que invierten en su consultorio).

Mail corto, sin adjuntos, sin PDF de 12 páginas:

> Asunto: consulta rápida sobre la agenda de su consultorio
>
> Dr./Dra. [Apellido], buen día.
>
> Soy Gabriel, hice el sistema de gestión que usa el consultorio del Od. Walter
> Benegas acá en [ciudad]: agenda, ficha clínica y facturación electrónica ARCA
> en un solo lugar.
>
> ¿Le sirve que le muestre en 15 minutos por videollamada cómo le quedaría a su
> consultorio? Si no le cierra, no le insisto.
>
> Gabriel — Naxad · [teléfono]

20 mails por semana → ~4 respuestas → ~2 demos → ~1 cliente cada dos semanas.
Es lento y es el camino.

### Canal 3 — Contenido

Un post por semana en Instagram y LinkedIn. **No promociones el producto:**
mostrá cómo se resuelve un problema del consultorio. "Cómo calcular tu tasa de
ausentismo", "qué te exige ARCA como odontólogo". Vendés en 1 de cada 5.

### Canal 4 — Círculos y colegios odontológicos

Los colegios provinciales tienen newsletter y convenios con proveedores. Un
acuerdo de descuento para colegiados te da acceso a cientos de matriculados de
una. Tarda meses, así que el mail va ahora aunque cobres recién en el mes 4.

### Métricas que sí importan

| Métrica | Objetivo mes 6 |
|---|---|
| Clínicas pagas | 10 |
| MRR | ARS 250.000 |
| Trials iniciados / mes | 8 |
| Conversión trial → pago | > 30% |
| Churn mensual | < 5% |
| Costo de infraestructura / MRR | < 25% |

---

## 5. Los riesgos, dichos sin adornos

**Precios en pesos con inflación.** Tu propio comentario en `planes.ts` lo avisa:
"en un año se licúa a la mitad". Poné un recordatorio en el calendario cada 3
meses para revisar la grilla, y en el T&C dejá escrito que los precios se ajustan
con aviso de 30 días. Sin esa cláusula, no podés subirlos.

**Dependencia de un solo cliente.** Si el Dr. Benegas se va, te quedás sin
ingreso, sin caso de referencia y sin usuario que reporte bugs. Los próximos dos
clientes no son crecimiento: son gestión de riesgo.

**Soporte 1 a 1 no escala.** Con 10 clínicas vas a estar contestando WhatsApp
todo el día y no vas a programar nada. Antes de llegar a 10: un video de
onboarding de 10 minutos, una base de ayuda de 15 artículos, y un horario de
soporte publicado (lunes a viernes, 9 a 18). Publicar el horario es lo que más
te va a proteger el tiempo.

**Vos sos el único punto de falla.** Si te enfermás una semana, no hay quien
despliegue un fix. Mínimo: documentá el runbook de deploy y rollback (ya tenés
`RUNBOOK-LANZAMIENTO.md`, extendelo) y dejá los accesos de emergencia en un
gestor de contraseñas que alguien de confianza pueda abrir.

**La tentación de agregar features.** Tenés un roadmap enorme en
`PENDIENTES-ROADMAP.md`: receta electrónica, cohortes, forecast, predicción de
no-show. **Nada de eso te trae el cliente número 2.** Ningún odontólogo va a
comprar por el forecast de ingresos. Van a comprar por la agenda, la ficha y la
facturación — que ya están. Congelá el roadmap de features hasta tener 10
clientes pagos, y usá ese tiempo en vender y en los 5 arreglos de la auditoría.

---

## 6. Resumen de plata

**Egresos mes 1:**

| Concepto | ARS aprox. |
|---|---|
| Supabase Pro (USD 25) | 34.000 |
| Vercel Pro (USD 20) | 27.000 |
| Dominios (2 × año, prorrateado) | 1.000 |
| Monotributo cat. A | 49.500 |
| **Total mensual** | **~111.500** |
| Abogado T&C + anexo (única vez) | 200.000 |

**Ingresos con la grilla actual (precio fundador):**

| Clínicas | MRR (mix Pro) | Resultado |
|---|---|---|
| 1 (hoy) | 24.900 | −86.600 |
| 3 | 74.700 | −36.800 |
| 5 | 124.500 | +13.000 ← **punto de equilibrio** |
| 10 | 249.000 | +137.500 |

**Cinco clínicas es donde el proyecto se sostiene solo.** Ese es el número que
tenés que tener en la cabeza los próximos tres meses. Todo lo demás es ruido.

---

## Fuentes

- [Vercel Hobby Plan — restricción de uso comercial](https://vercel.com/docs/plans/hobby)
- [Vercel Pricing 2026](https://costbench.com/software/developer-tools/vercel/)
- [Supabase Pricing 2026 — free tier, Pro y backups](https://uibakery.io/blog/supabase-pricing)
- [Supabase Pricing — límites reales del free tier](https://cotera.co/articles/supabase-pricing-guide)
- [Monotributo: escalas y cuotas desde agosto 2026 (ARCA)](https://www.lmneuquen.com/pais/arca-actualizo-los-montos-del-monotributo-las-nuevas-escalas-y-topes-facturacion-agosto-2026-n1247656)
- [Monotributo 2026: categorías y topes](https://www.iprofesional.com/impuestos/457897-monotributo-asi-quedan-las-escalas-topes-e-importes-a-pagar-desde-julio-2026)

*No soy contador ni abogado. Los montos fiscales y las obligaciones legales de
este documento son orientativos y hay que validarlos con un profesional antes de
tomar decisiones.*
