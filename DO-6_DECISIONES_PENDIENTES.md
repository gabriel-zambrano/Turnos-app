# DO-6 · Decisiones pendientes

**DO-6 está CONGELADO. Nada implementado.** Este documento contiene únicamente las decisiones que dependen de vos. El diseño técnico está en `P0-10_MULTIROL_FINAL.md`.

---

## ⚠️ Advertencia previa — leer antes de decidir

> **El modelo multirol administrativo no constituye todavía un modelo de autorización clínica por rol.**

Verificado sobre el esquema de producción: **43 de las 47 políticas RLS son de pertenencia al tenant**, no de rol. Su forma es:

```sql
tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
```

No mencionan `role`. Solo 4 políticas lo consultan, y las cuatro son administrativas: `arca_config_write`, `plantillas_write`, `crm_campanas_write`, `tenants_update_own`.

**Consecuencia concreta:** una vez implementado DO-6, un `odontologo` y una `staff` verán **exactamente lo mismo** que un `admin` en:

- pacientes y sus datos de contacto
- historia clínica y odontograma
- fotos clínicas
- turnos y tratamientos
- presupuestos y pagos

DO-6 restringe **quién factura, quién administra el equipo, quién edita la clínica y quién exporta**. No restringe quién ve una historia clínica.

**Esto no puede ofrecerse a una clínica como control de acceso a datos médicos.** Sería una afirmación falsa sobre protección de información de salud. La autorización clínica por rol es Fase 2 y requiere reescribir las 43 políticas.

---

## Decisión 1 · ¿Quién será `owner`?

**Estado verificado:** producción tiene **2 usuarios, ambos `admin`**. **No existe ningún `owner`.**

Migrar DO-6 sin resolver esto produce una clínica sin propietario. Y con la Decisión 4 tal como está —nadie otorga `owner` por invitación— **después ya no se puede crear uno**.

**Necesito:** el `user_id` que pasa a `owner`.

```sql
-- Para elegir con datos a la vista:
SELECT tu.user_id, tu.role, tu.creado_en, t.nombre AS clinica
FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
ORDER BY tu.creado_en;
```

El más antiguo suele ser quien creó la clínica. **Confirmalo, no lo asumas.**

**Bloquea:** M-2b, y por lo tanto todo DO-6.

---

## Decisión 2 · ¿Cómo se recupera una clínica que pierde a su último `owner`?

🔴 **Es el defecto más grave del diseño actual y no tiene solución dentro de él.**

Con las reglas propuestas: nadie otorga `owner` por invitación, y la transferencia exige **ser** owner. Si el único owner renuncia, pierde el email, fallece o borra su cuenta, **la clínica queda sin propietario de forma permanente**. Los `admin` no pueden crear uno.

Es un escenario común: en una clínica chica el dueño es el odontólogo titular, y esa persona rota.

**Opciones:**

**A · Excepción de plataforma.** La tabla `admin_users(id, email, creado_en)` ya existe y es solo `service_role`. Un administrador de plataforma —vos— podría ejecutar la transferencia sin ser owner del tenant, dejando asiento obligatorio en una tabla de auditoría.
*A favor:* resuelve el caso real. *En contra:* crea un rol con poder sobre todos los tenants.

**B · Segundo owner obligatorio.** Impedir que una clínica opere con un solo owner: al crear la clínica se exige designar un segundo.
*A favor:* no necesita superpoderes. *En contra:* fricción en el alta, y una clínica de una sola persona no puede cumplirlo.

**C · Asumir el riesgo.** Documentar que la recuperación es manual, vía SQL en producción.
*A favor:* cero trabajo. *En contra:* es exactamente lo que este proyecto viene tratando de eliminar, y el primer caso será un incidente sin herramienta.

**Bloquea:** el criterio GO de DO-6.

---

## Decisión 3 · ¿Qué pasa cuando se elimina un usuario de Auth?

**Estado verificado:** `tenant_users_user_id_fkey` es hoy **`ON DELETE CASCADE`** sobre `auth.users`. Borrar un usuario de Auth borra su membresía en silencio.

Tu decisión previa fue `RESTRICT` para la tabla de roles. Es técnicamente viable, pero deja una inconsistencia: **la `CASCADE` de `tenant_users` nunca podría dispararse**, porque el `RESTRICT` aborta la transacción antes. Queda como código muerto que describe un comportamiento que no ocurre.

**Sub-decisión:** ¿alineamos `tenant_users` también a `RESTRICT`?

**Verificado a favor:** el único `deleteUser` del código (`registro/route.ts:133`) es un rollback de alta fallida y ocurre **antes** de cualquier inserción en `tenant_users`. `RESTRICT` no lo rompe.

**NO VERIFICADO:** cómo presenta el Dashboard de Supabase el error de FK al intentar borrar un usuario, y si el borrado interno de GoTrue usa alguna vía que ignore la restricción. Hay que probarlo en local antes de aplicar.

---

## Decisión 4 · ¿Puede un `admin` crear otro `admin`?

Tu decisión provisional fue **no**, con jerarquía estricta:

| Otorgante | `owner` | `admin` | `odontologo` | `staff` |
|---|:-:|:-:|:-:|:-:|
| `owner` | ❌ solo transferencia | ✅ | ✅ | ✅ |
| `admin` | ❌ | ❌ | ✅ | ✅ |
| `odontologo` | ❌ | ❌ | ❌ | ✅ ⚠️ |
| `staff` | ❌ | ❌ | ❌ | ❌ |

⚠️ **Efecto que no pediste:** con `>` estricto, un `odontologo` puede otorgar `staff`. Si no lo querés, la regla deja de ser jerárquica y pasa a ser una matriz explícita — más código, más claro.

**Y una consecuencia operativa de decir "no":** una clínica cuyo owner se va queda con admins que no pueden nombrar a nadie de su nivel. El equipo solo puede achicarse. Conecta directamente con la Decisión 2.

---

## Decisión 5 · ¿Qué permisos concretos tendrá `odontologo`?

**Estado verificado: `odontologo` no aparece en ninguna línea del código ni del esquema.** Cero ocurrencias en `src/` y en `supabase/`. Es un rol que existe solo en las decisiones DO-6.

Si se implementa hoy sin más cambios, `odontologo` significa exactamente esto:

| | Capacidad | ¿Puede? |
|---|---|---|
| ✅ | Ver y editar pacientes, historia clínica, odontograma, fotos | **Sí — igual que `admin`** |
| ✅ | Ver y editar turnos, tratamientos, presupuestos | **Sí — igual que `admin`** |
| ❌ | Configurar o anular facturación | No |
| ❌ | Plantillas de consentimiento | No |
| ❌ | Campañas CRM | No |
| ❌ | Editar datos de la clínica | No |
| ❌ | Exportar datos | No |
| ❌ | Gestionar el equipo | No |
| ❌ | Cancelar la suscripción | No |

**En una frase: un `admin` sin acceso administrativo.** No es "acceso restringido a la ficha del paciente".

**Necesito saber si eso es lo que querés que signifique.** Si esperabas que un odontólogo viera solo *sus* pacientes o solo *sus* turnos, eso **no existe** y no lo trae DO-6: requiere reescribir políticas RLS, que es Fase 2.

---

## Decisión 6 · ¿Qué permisos concretos tendrá `staff`?

**Estado verificado:** `staff` sí existe — es el valor por defecto de `/api/equipo/invitar` (`role || 'staff'`). Pero **ninguna política ni ruta lo consulta**: solo importa que *no* sea `admin` ni `owner`.

Con el modelo propuesto, `staff` tendría **exactamente los mismos permisos que `odontologo`** de la tabla anterior. La única diferencia entre los dos roles sería la etiqueta en la pantalla de equipo, y —si aceptás el efecto de la Decisión 4— que `odontologo` puede otorgar `staff`.

**Pregunta concreta: ¿te sirven dos roles que hacen exactamente lo mismo?**

Tres caminos:

**A · Implementarlos igual.** Preparan el terreno para Fase 2 y la etiqueta comunica la función de la persona.
**B · Dejar solo `staff` por ahora** y sumar `odontologo` cuando existan permisos que lo distingan.
**C · Diferenciarlos ya**, con una política que limite a `staff` en historia clínica — pero eso **es Fase 2** y sale del alcance de DO-6.

Mi lectura: si el piloto son clínicas donde todos son `admin`, la diferencia no se ejercita y **B** es la opción honesta.

---

## Resumen

| | Decisión | Bloquea | Estado |
|---|---|---|---|
| **1** | Quién será `owner` | Toda la migración | 🔴 Pendiente |
| **2** | Recuperación del último `owner` | Criterio GO | 🔴 Pendiente |
| 3 | `CASCADE` vs `RESTRICT` en `tenant_users` | M-2 | 🟡 Pendiente |
| 4 | ¿`admin` crea `admin`? + el caso `odontologo → staff` | M-4 | 🟡 Provisional |
| 5 | Qué significa `odontologo` | M-1 | 🟡 Pendiente |
| 6 | Qué significa `staff`, y si se justifica separarlo | M-1 | 🟡 Pendiente |

**Las decisiones 1 y 2 bloquean el arranque. Las otras cuatro pueden resolverse durante la implementación.**

**Y ninguna de las seis cambia la advertencia inicial:** DO-6 no es control de acceso clínico.
