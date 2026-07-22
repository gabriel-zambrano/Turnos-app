# Decisiones de producto — DentalDesk

Registro de decisiones que afectan el modelo de negocio y el acceso a datos.
Todo lo que esté como **PENDIENTE** hay que resolverlo antes de tener clientes
pagos reales.

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
