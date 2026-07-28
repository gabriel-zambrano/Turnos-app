# Decisiones de producto — DentalDesk

Registro de decisiones que afectan el modelo de negocio y el acceso a datos.
Todo lo que esté como **PENDIENTE** hay que resolverlo antes de tener clientes
pagos reales.

---

## 0. Etapa actual: el producto vive sobre el dominio del Dr. Benegas — TRANSITORIO

**Situación (27/07/2026).** DentalDesk todavía no tiene infraestructura propia.
La plataforma corre sobre `walterbenegas.com.ar`, el dominio del primer
consultorio, que hace de banco de pruebas mientras se pulen las funciones.

**A dónde va.** DentalDesk pasa a tener su **dominio y su marca propios**, y el
consultorio del Dr. Benegas queda como un cliente más, con su dominio apuntando
a su clínica. Es una migración planificada, no un accidente a corregir.

**Por qué importa registrarlo.** Mientras dure esta etapa, "el dominio de la
plataforma" y "el dominio de la clínica" son el mismo, y eso **esconde bugs de
multi-tenant**: código que mezcla los dos conceptos funciona igual, y el error
recién aparece con la segunda clínica. En esta sesión salieron dos casos:

- Los mails de la reserva online armaban los links con `APP_URL` (el dominio de
  la plataforma) en vez del de la clínica. El paciente del Dr. Benegas recibió
  un mail que lo llevaba a otro consultorio, **con su token de portal viajando
  por un dominio ajeno**. Resuelto con `urlDeClinica()`.
- La resolución de clínica por hostname no contemplaba el `www`.

**Regla de trabajo mientras tanto:** ante cualquier URL que se le muestre a un
paciente, preguntarse *¿esto es de la plataforma o de la clínica?*. Si es algo
que ve un paciente, sale del `custom_domain` de su clínica. `APP_URL` es solo
para lo que pertenece al producto (registro, precios, panel de admin).

### Checklist para el día de la migración

| Qué | Dónde | Nota |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Vercel | Al dominio nuevo de DentalDesk |
| `NEXT_PUBLIC_APP_NAME` | Vercel | Ya sale de variable, no está hardcodeado |
| `EMAIL_DOMAIN` y casillas `EMAIL_FROM_*` | Vercel + Resend | El dominio nuevo hay que **verificarlo en Resend** antes de cortar, o dejan de salir todos los mails |
| `custom_domain` del tenant Benegas | Supabase | Que quede con `walterbenegas.com.ar`, para que sus links sigan saliendo por lo suyo |
| Dominios del proyecto | Vercel | Sumar el nuevo y mantener el del doctor apuntando al mismo proyecto |
| Cuenta de MercadoPago | MercadoPago | Los cobros de suscripción son de DentalDesk, no del consultorio |
| Facturación ARCA | — | **No se toca**: el CUIT y el certificado son del Dr. Benegas y siguen siendo suyos |
| Links ya compartidos | — | Los de reserva y portal que circulan por WhatsApp e Instagram tienen que seguir funcionando: **no dar de baja el dominio viejo**, redirigirlo |

**Lo que ya está preparado para esto:** `src/lib/config.ts` concentra todo lo
que identifica a la plataforma y sale de variables de entorno, así que la
migración no debería requerir tocar código. Si aparece algo hardcodeado, va ahí.

### Qué clínica es real y cuáles son de prueba (27/07/2026)

En producción quedan dos filas en `tenants`. **Solo una tiene pacientes reales.**

| Clínica | `custom_domain` | Qué es |
|---|---|---|
| Consultorio Dr. Walter Benegas | `turnos.walterbenegas.com.ar` | **Real, en producción.** Pacientes, turnos y facturación con validez fiscal |
| Dra. Tamara Suju | — | Prueba |

**SMILE DESK: eliminada el 27/07/2026.** Se borró con sus datos de prueba (un
paciente y una cita cargados a mano). Motivo: al pertenecer el operador a varias
clínicas, aparecía como clínica activa y confundía —el dashboard saludaba con su
nombre entrando por el dominio del doctor, y el link de reserva de Configuración
salía con su slug—. La marca propia va a tener su tenant nuevo cuando llegue la
migración; no se reutiliza este.

> El borrado hay que hacerlo tabla por tabla: solo 8 de las 21 tablas con
> `tenant_id` tienen `ON DELETE CASCADE`, así que un `DELETE FROM tenants`
> directo falla por clave foránea.

Los links que recibe un paciente salen del `custom_domain` de su clínica, así
que **Benegas responde por `turnos.`**, no por `www.`. Ese subdominio tiene que
estar configurado en Vercel: es el que reciben todos sus pacientes.

**Antes de abrir a clientes reales, dar de baja la que queda de prueba:**

```sql
UPDATE tenants SET activo = false
WHERE subdominio_generico = 'dratamysuju';
```

Por qué conviene, y no es sólo prolijidad:

- **Los crons las recorren.** El briefing diario y las campañas de CRM iteran
  sobre las clínicas activas. Si alguna quedó con un email asociado, le empiezan
  a llegar mails a alguien que no los pidió.
- **Ensucian las métricas** del panel de admin: contar clientes da tres.
- **"Dra. Tamara Suju" arrastra el problema de la sección 2**: se creó desde el
  perfil del Dr. Benegas, así que él figura como `owner` y accede a sus
  historias clínicas. Siendo de prueba da igual; importaría si esa fila se
  reutilizara para un cliente real en vez de crearse desde cero. **No
  reutilizarla.**

---

## 1. Equipo y cobro por usuarios — DECIDIDO (22/07/2026)

**Modelo elegido: cupos por plan.** Cada plan incluye una cantidad de usuarios;
para sumar más gente, la clínica cambia de plan. No hay cargo por usuario suelto.

| Plan | Usuarios incluidos |
|---|---|
| starter | 1 |
| pro | 3 |
| business | ilimitado |

Definido en `src/lib/planes.ts`. Se aplica al invitar (`/api/equipo/invitar`
devuelve 409 con `motivo: 'cupo_lleno'`) y se muestra en `/equipo`.

**Por qué así y no cargo por usuario extra:** el cobro por asiento obligaría a
modificar el monto de la suscripción en MercadoPago cada vez que el equipo
cambia, lo que es frágil y complica las renovaciones. El modelo por cupos es el
estándar del rubro y no toca la suscripción.

**Si en el futuro se quiere cobrar por asiento**, el lugar a modificar es
`cuposDelPlan()` más la lógica de precio en `/api/billing/checkout`.

---

## 1 bis. Grilla de precios y features por plan — DECIDIDO (27/07/2026)

Definida en `src/lib/planes.ts`, única fuente de verdad para el checkout, el
webhook, la página `/precios` y los gates de la app.

| Plan | Fundador | Regular | Usuarios | Recordatorios | WhatsApp/CRM | BI |
|---|---|---|---|---|---|---|
| starter | $12.900 | $16.900 | 1 | ❌ | ❌ | ❌ |
| pro | $24.900 | $29.900 | 3 | ✅ | ✅ | ❌ |
| business | $39.900 | $49.900 | ilimitado | ✅ | ✅ | ✅ |

**Anclaje del precio:** una consulta particular ronda los $40.000. Todos los
planes quedan por debajo, para sostener el argumento "cuesta menos que una
consulta; si te evita un solo ausente, ya se pagó". Hay un test que falla si
algún plan se pasa de ese techo.

**Por qué los recordatorios van en Pro y no en Starter:** son el feature que
baja el ausentismo, o sea el que le genera plata al odontólogo. Regalarlo en
Starter elimina el motivo para subir de plan.

**Trial:** los 14 días habilitan todo, sin importar el plan asignado.

**Columnas `feature_*` de `tenants`:** dejaron de ser el interruptor real. Ahora
son **concesiones manuales que solo suman** (panel de admin, grandfathering). Lo
que la clínica puede usar se calcula al leer, con `featureHabilitada(plan,
concesión, enTrial)`. Así un cambio de grilla nunca le quita a un cliente algo
que ya venía usando.

**Plan contratado ↔ MercadoPago:** viaja en `external_reference` con formato
`"<tenantId>|<plan>"`, porque MP no devuelve metadata propia. Las suscripciones
viejas (sin separador) caen a `pro`, que es como se comportaban antes.

**⚠️ A resolver:** los Términos y Condiciones describen a Starter como *plan
gratuito*. O se corrige el texto legal, o se define un Starter gratis con menos
funciones y la grilla arranca en Pro.

**⚠️ Inflación:** revisar la grilla cada 3 meses. El Precio Fundador se congela
solo para quienes ya entraron; los nuevos pagan el precio actualizado.

---

## 2. Alta de clínicas: dos caminos distintos — PENDIENTE DE DEFINIR

Hoy conviven dos formas de crear una clínica, y hacen cosas diferentes:

**a) Registro público (`/registro`)** — crea un **usuario nuevo e independiente**
con su propio tenant y trial de 14 días. Es el camino correcto para un cliente
que se da de alta solo.

**b) "Agregar clínica" desde adentro (`/api/clinicas`)** — crea el tenant y
vincula **al usuario que la crea** como dueño. Pensado para un profesional con
varias sedes propias.

**El riesgo:** si se usa (b) para dar de alta a *otro* odontólogo, quien la creó
queda con acceso permanente a las historias clínicas de esa clínica. No es una
falla de aislamiento —el sistema hace lo pedido— pero es un problema de
privacidad entre profesionales independientes.

**Caso real detectado:** la clínica "Dra. Tamara Suju" fue creada desde el perfil
del Dr. Benegas, por lo que él figura como `owner` de esa clínica.

**A decidir:** si (b) se restringe a sedes del mismo titular (y se aclara en la
UI), o si se elimina y todo alta nueva pasa por (a).

**Implicancia de facturación pendiente:** hoy cada tenant corre su propio trial
y su propio cobro. Si un odontólogo con dos sedes debería pagar una sola vez,
hay que modelar una entidad "cuenta" por encima de `tenants`.

---

## 3. Acceso del operador de la plataforma a datos de clientes — PENDIENTE

El usuario `studioandbrand@gmail.com` (dueño de la plataforma) está cargado como
`admin` en `tenant_users` del consultorio del Dr. Benegas. Eso significa que
accede a las historias clínicas de esa clínica a través de la app normal, y que
aparece en su lista de Equipo.

Fue práctico para desarrollar, pero **para un SaaS de salud con clientes reales
el operador no debería ser miembro permanente de cada clínica**.

**Recomendación:** quitar esa membresía y, cuando haga falta dar soporte, usar
un acceso temporal y registrado. Como operador ya existe service-role para
tareas administrativas.

**Esto es material para la revisión legal:** quién accede a datos sensibles de
salud, con qué justificación y bajo qué registro.

---

## 4. Roles: la clínica principal no tiene `owner` — MENOR

En el consultorio del Dr. Benegas los dos usuarios tienen rol `admin`; ninguno
es `owner`. Hoy no rompe nada porque los permisos aceptan ambos, pero si se
agrega alguna acción exclusiva del propietario, esa clínica quedaría sin nadie
habilitado.

**Guarda ya implementada:** `/api/equipo/miembros` (DELETE) impide quitar al
único responsable (`owner` o `admin`) de una clínica, y también impide que
alguien se quite a sí mismo.

---

## 5. Tokens del portal de paciente sin expiración — PENDIENTE

Los links del portal (`/paciente/<token>`) no caducan: la columna `token_expira`
existe pero está en NULL para todos, de forma deliberada, para no romper los
links ya entregados a pacientes.

**A decidir:** política de rotación o expiración. Hoy un link filtrado da acceso
indefinido a los datos de ese paciente.
