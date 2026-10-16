# Planificación 90 días — lanzamiento de DentalDesk

**Desde:** 30/07/2026 · **Hasta:** 28/10/2026
**Objetivo único:** llegar a **5 clínicas pagas** (punto de equilibrio).
**Presupuesto:** USD 45/mes de infraestructura. Nada más hasta facturar.

Documentos que acompañan: `AUDITORIA-PRELANZAMIENTO-2026-07.md` (qué arreglar) y
`PLAN-NAXAD.md` (empresa, hosting, landing, canales).

---

## Cómo está armado esto

Tres bloques de un mes. Cada uno tiene **un solo objetivo** — si al final del mes
lo cumpliste, el mes fue bueno aunque hayas dejado tareas colgadas.

| Mes | Objetivo | Se sabe que se cumplió cuando |
|---|---|---|
| 1 · Agosto | La plataforma es vendible | Dominio propio, sin fugas, con backups, landing publicada |
| 2 · Septiembre | Validar que se vende | 3 clínicas pagas y un onboarding que no te consume el día |
| 3 · Octubre | Punto de equilibrio | 5 clínicas pagas, MRR > costos, churn 0 |

**Regla que ordena los tres meses: 60% del tiempo a vender, 40% a programar.**
Está invertido respecto a lo que te va a pedir el cuerpo. El producto ya está
bastante bien; lo que no está es la distribución.

---

# MES 1 — Agosto · Hacer la plataforma vendible

## Semana 1 (31/07 – 06/08) · Cerrar las fugas

**Todo esto es de la auditoría, y no lleva más de un día de trabajo real.**

- [ ] **Sentry.** `sendDefaultPii: false` en los tres configs, `tracesSampleRate: 0.1`,
      y un `beforeSend` que borre tokens de la URL y las cookies. *(1 h)*
- [ ] **Next.js.** `npm i next@^14.2.35` + `npm audit fix`. Typecheck, tests,
      build, deploy. *(2 h)*
- [ ] **Cabeceras de seguridad** en `next.config.js`: HSTS, `nosniff`,
      `X-Frame-Options`, `Referrer-Policy: no-referrer`, `poweredByHeader: false`. *(2 h)*
- [ ] **Supabase Pro** (USD 25). Activar backups. *(5 min)*
- [ ] **`pg_dump` semanal a Google Drive** por cron. *(1 h)*
- [ ] **Restaurar el backup una vez** en un proyecto de prueba y anotar los pasos
      en `RUNBOOK-BACKUP.md`. *(2 h — el paso que todo el mundo saltea)*
- [ ] **Vercel Pro** (USD 20). Ya estás cobrando; Hobby prohíbe el uso comercial.
- [ ] Actualizar `ESTADO-PROYECTO.md`: las tres migraciones "pendientes" ya se
      movieron a `supabase/migrations/`, y no hay commits sin pushear.

**En paralelo, sin excusa:** comprar `naxad.com.ar` y `dentaldesk.com.ar` en NIC.ar.

> ✅ **Fin de semana 1:** `npm audit --omit=dev` sin severidad alta salvo `xlsx`,
> backups corriendo y probados, dominios comprados.

## Semana 2 (07/08 – 13/08) · Separar los dominios

El hito que desbloquea todo. Seguí el checklist de `DECISIONES-PRODUCTO.md` § 0.

- [ ] `dentaldesk.com.ar` apuntado a Vercel, con wildcard `*.dentaldesk.com.ar`.
- [ ] Migrar la app a `app.dentaldesk.com.ar`.
- [ ] `walterbenegas.com.ar` queda como dominio propio del cliente #1, con su
      subdominio de clínica funcionando en paralelo.
- [ ] Actualizar `NEXT_PUBLIC_APP_URL` y verificar que **todo** lo que ve un
      paciente sale por `urlDeClinica()`. Los tests de `guardas-multitenant.test.ts`
      ya te cubren esto: si pasan, estás.
- [ ] **Crear una segunda clínica de prueba** y recorrer el flujo completo:
      registro → agenda → paciente → portal → factura. Es la única forma de que
      aparezcan los bugs de multi-tenant que hoy están tapados.
- [ ] Correr el checklist de `RUNBOOK-LANZAMIENTO.md` entero.

> ✅ **Fin de semana 2:** dos clínicas conviviendo en dominios distintos, sin un
> solo cruce de datos ni de branding.

## Semana 3 (14/08 – 20/08) · Landing y precios

- [ ] Landing en `src/app/(marketing)/page.tsx` como **Server Component estático**,
      leyendo precios de `src/lib/planes.ts`. Estructura completa en
      `PLAN-NAXAD.md` § 3.2.
- [ ] Capturas reales de la app (agenda, ficha, odontograma, factura). Nada de
      mockups de stock.
- [ ] `sitemap.ts`, `robots.ts`, `metadata` por página, Open Graph, JSON-LD
      `SoftwareApplication`.
- [ ] Contador real de cupos fundadores leído de la base, no hardcodeado.
- [ ] Revisar `/legal`: T&C y Privacidad con responsable/encargado del tratamiento.
- [ ] Redactar el **anexo de Encargado de Tratamiento** (2 páginas) y mandarlo a
      revisión de un abogado.
- [ ] Video demo de 3 minutos grabado con Loom o OBS. Sin edición. Que se vea
      la app funcionando de verdad.

> ✅ **Fin de semana 3:** landing publicada, PageSpeed móvil > 90, demo grabada.

## Semana 4 (21/08 – 27/08) · Permisos y onboarding

- [ ] **RLS por rol** en `costos_fijos`, `ingresos_manuales`, `egresos_manuales`,
      `meta_mensual`, `facturas`, `presupuestos`. Función `rol_en_tenant()`
      (SQL en la auditoría § 4).
- [ ] Exponer el rol en `TenantContext` y ocultar Finanzas / Facturación /
      Configuración para `staff`.
- [ ] `token_expira = now() + 90 días` en los **seis** lugares donde se genera un
      token de paciente. Borrar el fallback muerto de `paciente/[token]/route.ts`.
- [ ] `xlsx` al tarball del CDN oficial + límite de tamaño en `/api/pacientes/importar`.
- [ ] **Checklist de onboarding** escrito: qué hacés paso a paso cuando entra una
      clínica nueva (crear tenant, importar Excel, cargar tratamientos y precios,
      configurar horarios, subir logo, capacitación de 30 min).
- [ ] **Monotributo** dado de alta si todavía no lo tenés.

> ✅ **Fin de mes 1:** la plataforma es vendible. Podés darle acceso a un
> desconocido sin cruzar los dedos.

---

# MES 2 — Septiembre · Validar que se vende

**Cambia el reparto del tiempo: 70% vender, 30% programar.**

## Semana 5 (28/08 – 03/09) · Armar la máquina de prospección

- [ ] Planilla de leads en Google Sheets: nombre, consultorio, ciudad, contacto,
      canal, estado, fecha del próximo toque. Seis columnas, nada más.
- [ ] Cargar **50 odontólogos** desde Google Maps, filtrando los que tienen web o
      Instagram activo.
- [ ] Pedirle al Dr. Benegas: testimonio en video de 60 s, 3 referidos, permiso
      escrito para usarlo como caso.
- [ ] Publicar el caso de éxito en la landing.
- [ ] Mandar los **primeros 20 mails** (plantilla en `PLAN-NAXAD.md` § 4).
- [ ] Sumar el mail al Instagram y LinkedIn de Naxad. Primer post.

## Semana 6 (04/09 – 10/09) · Primeras demos

- [ ] 20 mails más. Total acumulado: 40.
- [ ] Hacer las demos que salgan. **Guion de 15 minutos:** 2 min de problema,
      10 de app en vivo con datos parecidos a los suyos, 3 de precio y cierre.
- [ ] Después de cada demo, anotar en la planilla **la objeción textual**. Esas
      frases son el mejor material que vas a tener para reescribir la landing.
- [ ] Artículo 1 del blog: *Cómo facturar electrónicamente en ARCA siendo
      odontólogo (guía 2026)*.
- [ ] Configurar UptimeRobot.

## Semana 7 (11/09 – 17/09) · Cerrar los primeros

- [ ] 20 mails más. Acumulado: 60.
- [ ] Seguimiento de todos los que abrieron pero no contestaron (un solo toque,
      a los 5 días, corto).
- [ ] **Onboardear a las clínicas que digan que sí.** Es la tarea más importante
      del mes: un onboarding malo se convierte en churn en 30 días.
- [ ] Grabar el **video de onboarding de 10 minutos** que le vas a mandar a cada
      cliente nuevo. Deja de repetir la misma capacitación.
- [ ] Publicar horario de soporte (lun–vie, 9–18) y respetarlo.

## Semana 8 (18/09 – 24/09) · Arreglar lo que rompió el uso real

- [ ] Bugs y fricciones que aparecieron con las clínicas nuevas. **Prioridad
      absoluta sobre cualquier feature del roadmap.**
- [ ] Base de ayuda: 15 artículos cortos con las preguntas que ya te hicieron.
- [ ] Rate limit a Upstash Redis (free tier).
- [ ] Tests de las rutas de facturación ARCA: que `esSimulada` sea `false` con
      credenciales, y que el CAE ficticio no pueda colarse en producción.
- [ ] Revisar la grilla de precios contra la inflación del trimestre.

> ✅ **Fin de mes 2:** 3 clínicas pagas, onboarding de menos de 2 horas por
> cliente, y la lista de objeciones reales escrita.

---

# MES 3 — Octubre · Punto de equilibrio

## Semana 9 (25/09 – 01/10) · Reescribir con lo aprendido

- [ ] Reescribir el hero y la sección de objeciones de la landing **con las frases
      textuales** que te dijeron en las demos. No con lo que vos creés que
      necesitan.
- [ ] Sumar los testimonios de las clínicas nuevas.
- [ ] Artículo 2: *Cuánto te cuesta realmente cada paciente que no viene*.
- [ ] 20 mails más. Acumulado: 80.

## Semana 10 (02/10 – 08/10) · Escalar lo que funcionó

- [ ] Mirar la planilla: **¿qué canal trajo los clientes?** Duplicar ese. Cortar
      los otros sin culpa.
- [ ] Mail a los colegios odontológicos provinciales proponiendo convenio para
      colegiados. (Tarda meses; por eso se manda ahora.)
- [ ] Programa de referidos activo: 3 meses gratis por colega que se suscriba.
- [ ] Artículo 3: *Historia clínica digital: qué exige la Ley 26.529*.

## Semana 11 (09/10 – 15/10) · Retener

- [ ] Llamar **uno por uno** a todos los clientes. Pregunta única: *"¿qué es lo
      que más te molesta del sistema?"*. Anotar textual.
- [ ] Arreglar las dos cosas que más se repitan.
- [ ] Revisar métricas de uso: si alguna clínica dejó de entrar, es churn que
      todavía se puede evitar. Llamala hoy.
- [ ] Facturar tus propias suscripciones del trimestre (factura C).

## Semana 12 (16/10 – 22/10) · Consolidar

- [ ] Cerrar las clínicas que faltan para llegar a 5.
- [ ] Balance del trimestre: MRR, costos, churn, conversión trial → pago.
- [ ] Decidir el próximo trimestre **con datos**: ¿más clínicas del mismo perfil,
      o el primer feature que pidieron todos?
- [ ] Recién ahora, si las 5 clínicas están estables, retomar el roadmap
      (`PENDIENTES-ROADMAP.md`). La receta electrónica es la candidata natural:
      es el único pendiente que aparece como pedido real y no como idea tuya.

> ✅ **Fin de mes 3:** 5 clínicas pagas, MRR ≈ ARS 125.000, ingresos > costos.
> El proyecto se sostiene solo.

---

## Tablero semanal

Cinco números. Miralos los viernes, 10 minutos, y no toques nada más.

| Métrica | Hoy | Meta 90 días |
|---|---|---|
| Clínicas pagas | 1 | 5 |
| MRR (ARS) | 24.900 | 125.000 |
| Mails de prospección enviados | 0 | 80 |
| Demos hechas | 0 | 12 |
| Churn | 0 | 0 |

---

## Las cinco reglas

1. **Ningún feature nuevo hasta 5 clientes pagos.** El roadmap no te trae el
   cliente #2. Vender, sí.
2. **Un bug de un cliente pago le gana a cualquier tarea de este plan.** Sin
   excepción.
3. **Ningún gasto nuevo hasta el punto de equilibrio.** Si algo cuesta plata y no
   está en el presupuesto de USD 45, la respuesta es no.
4. **60% del tiempo vendiendo.** Si una semana programaste más que eso, la semana
   salió mal aunque hayas cerrado 10 tickets.
5. **Si una semana no llegás, corré la tarea, no el objetivo del mes.** El plan
   está para orientar, no para hacerte sentir mal.

---

## Lo que puede salir mal, y qué hacer

| Si pasa esto… | Hacé esto |
|---|---|
| A la semana 8 no cerraste ninguna clínica | El problema es el mensaje, no el producto. Llamá a 5 de los que dijeron que no y preguntá por qué. |
| El Dr. Benegas se va | Frená todo y averiguá el motivo real. Es la información más cara que vas a conseguir gratis. |
| Se rompe algo en producción y no tenés backup probado | Por eso la semana 1 incluye restaurar el backup. No lo saltees. |
| Te absorbe el soporte y no programás nada | Video de onboarding + base de ayuda + horario publicado. Los tres, no uno. |
| La inflación se come los precios | Revisión trimestral agendada, y la cláusula de ajuste con 30 días de aviso en el T&C. |
| Aparece un competidor con más plata | Tu ventaja no es el capital: es que conocés un consultorio argentino de verdad y tenés ARCA andando. Doblá la apuesta ahí. |

---

*Generado el 30/07/2026 junto con `AUDITORIA-PRELANZAMIENTO-2026-07.md` y
`PLAN-NAXAD.md`.*
