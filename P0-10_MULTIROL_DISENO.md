# DO-6 · Modelo multirol — diseño

**22/08/2026 · DISEÑO. Nada implementado.**

Cierra el bloqueante #3 del tablero: *"el sistema nunca operó con roles diferenciados"*.

---

## 1 · Estado actual, verificado en el repositorio

```sql
CREATE TABLE public.tenant_users (
  id         uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid NOT NULL,
  tenant_id  uuid NOT NULL,
  role       text DEFAULT 'admin'::text NOT NULL,   -- ← sin CHECK
  creado_en  timestamptz DEFAULT now()
);
```

Un usuario tiene **un** rol por clínica. Hay **2 usuarios en producción, ambos `admin`**.

### Dónde se consulta el rol hoy

**4 policies RLS** — las únicas de 47 que diferencian por rol:

| Policy | Tabla | Condición |
|---|---|---|
| `arca_config_write` | `arca_config` | `role IN ('admin','owner')` |
| `plantillas_write` | `plantillas_consentimiento` | `role IN ('admin','owner')` |
| `crm_campanas_write` | `crm_campanas` | `role IN ('admin','owner')` |
| `tenants_update_own` | `tenants` | `role IN ('owner','admin')` |

**8 rutas API** — todas con el mismo patrón `role !== 'admin' && role !== 'owner'`:

`pacientes/exportar` · `equipo/miembros` · `equipo/invitar` · `facturacion/config` · `facturacion/anular` · `billing/cancelar` · `admin/tenants` · `clinicas`

**2 funciones SQL** — `fn_ajustar_puntos_manual` y `fn_canjear_premio`, vía `tiene_rol()` desde B1.2/B1.3.

**1 UI** — `equipo/page.tsx`, que solo conoce tres etiquetas.

---

## 2 · Tres defectos que el diseño tiene que cerrar

### 🔴 D-1 · El default es `'admin'` — falla hacia lo abierto

```sql
role text DEFAULT 'admin'::text NOT NULL
```

Una fila insertada sin especificar rol nace **administradora**. En un modelo de permisos, el default tiene que ser el mínimo, nunca el máximo. Hoy un `INSERT` incompleto —un script, una migración, un bug— crea un admin en silencio.

Que los 2 usuarios reales sean `admin` puede ser decisión deliberada o puede ser este default. **No hay forma de distinguirlo desde los datos.**

### 🔴 D-2 · `role` es `text` sin `CHECK` — cualquier cadena es un rol

No hay restricción. `'Admin'`, `'ownr'` o `'pepe'` se guardan sin error.

El efecto es silencioso y en la dirección peligrosa: un rol mal escrito **no coincide con ninguna verificación**, así que la persona pierde permisos sin que nada avise. Pero si el typo cae del lado del que otorga —`'owner '` con espacio en un lugar y `'owner'` en otro— el resultado es impredecible.

### 🔴 D-3 · `/api/equipo/invitar` acepta el rol sin validarlo

```ts
const { email, role, tenantId } = await req.json()
...
role: role || 'staff'
```

`role` viene del cuerpo del request y **no se valida contra ninguna lista**. Hoy, un `admin` autenticado puede invitar a alguien como `'owner'` — eso es **R-2**, confirmado a nivel de código, no inferido.

Y puede inyectar cualquier cadena, produciendo D-2 a voluntad.

---

## 3 · El modelo propuesto

### Tabla de asociación, no columna

```sql
CREATE TABLE public.tenant_user_roles (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol        text NOT NULL REFERENCES roles(codigo),
  otorgado_por uuid REFERENCES auth.users(id),
  otorgado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, rol)
);

CREATE TABLE public.roles (
  codigo    text PRIMARY KEY,
  nombre    text NOT NULL,
  jerarquia integer NOT NULL          -- para D-3
);

INSERT INTO roles (codigo, nombre, jerarquia) VALUES
  ('owner',      'Propietario',   100),
  ('admin',      'Administrador',  80),
  ('odontologo', 'Odontólogo',     50),
  ('staff',      'Secretaría',     30);
```

**Por qué tabla y no `roles text[]`.** Un array no admite FK, así que D-2 seguiría abierto. Y no deja registrar quién otorgó cada rol y cuándo, que es lo que permite auditar una escalada después de que ocurre.

**Por qué `roles` como tabla y no un `CHECK`.** Un `CHECK` exige migración para agregar un rol. Con FK, `jerarquia` queda como dato consultable — y es lo que hace posible expresar D-3 sin condicionales desperdigados.

### `tenant_users` sobrevive, y esa es la clave

**43 policies RLS hacen esto:**

```sql
tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
```

Preguntan **pertenencia**, no rol. Si `tenant_users` se elimina o cambia de forma, hay que reescribir 43 policies en una sola migración — y cualquier error deja a alguien sin acceso a historia clínica.

**No se toca.** `tenant_users` responde *"¿X pertenece a la clínica Y?"*. `tenant_user_roles` responde *"¿qué puede hacer X ahí?"*. Son preguntas distintas y merecen tablas distintas.

La columna `tenant_users.role` **se conserva durante toda la transición** como respaldo de rollback. Se elimina en una migración posterior, cuando el modelo nuevo lleve semanas funcionando.

### `tiene_rol()` es la única costura

Ya existe, ya está aplicada, y B1.2/B1.3 ya la usan. **Cambia solo su cuerpo:**

```sql
CREATE OR REPLACE FUNCTION public.tiene_rol(p_tenant_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND rol = ANY(p_roles)
  )
$$;
```

Firma idéntica. `fn_ajustar_puntos_manual` y `fn_canjear_premio` **no se vuelven a tocar**. Eso fue el objetivo de introducirla en B1.1 y ahora se cobra.

### Jerarquía — cierra D-3 y R-2

```sql
CREATE OR REPLACE FUNCTION public.puede_otorgar_rol(p_tenant_id uuid, p_rol text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT max(r.jerarquia) FROM tenant_user_roles tur
       JOIN roles r ON r.codigo = tur.rol
      WHERE tur.user_id = auth.uid() AND tur.tenant_id = p_tenant_id),
    0
  ) >= (SELECT jerarquia FROM roles WHERE codigo = p_rol)
$$;
```

**Regla: solo se otorga un rol de jerarquía menor o igual a la propia.**

- `owner` (100) otorga cualquiera, incluido `owner`
- `admin` (80) otorga `admin`, `odontologo`, `staff` — **no `owner`** ← R-2 cerrado
- `odontologo` (50) y `staff` (30) no otorgan nada relevante

Un rol inexistente devuelve `NULL` en la comparación → `false`. **Falla hacia lo cerrado**, al revés que D-1.

### El último owner

Una clínica sin `owner` es una clínica que nadie puede administrar. El `DELETE` sobre `tenant_user_roles` necesita un trigger:

```sql
-- Si la fila borrada era 'owner' y no queda ningún otro owner en ese tenant,
-- abortar. Vale también cuando el owner intenta quitarse el rol a sí mismo.
```

`equipo/miembros/route.ts` ya tiene una verificación parecida en la capa de aplicación. **La capa de aplicación no alcanza:** las funciones `SECURITY DEFINER` y `service_role` la esquivan. El trigger es el único lugar donde el invariante se sostiene siempre.

---

## 4 · Migración de datos

```sql
INSERT INTO tenant_user_roles (tenant_id, user_id, rol, otorgado_en)
SELECT tenant_id, user_id, role, COALESCE(creado_en, now())
FROM tenant_users
WHERE role IN (SELECT codigo FROM roles);
```

Con 2 usuarios, ambos `admin`, produce 2 filas.

```sql
-- Ningún rol puede quedar afuera por no estar en el catálogo.
DO $$
DECLARE v_huerfanos integer;
BEGIN
  SELECT count(*) INTO v_huerfanos FROM tenant_users
  WHERE role NOT IN (SELECT codigo FROM roles);
  IF v_huerfanos > 0 THEN
    RAISE EXCEPTION 'DO-6: % membresías con rol fuera del catálogo. Resolver a mano antes de migrar.', v_huerfanos;
  END IF;
END $$;
```

Esa verificación **tiene que ir antes del INSERT**. Si D-2 dejó pasar un `'Admin'` con mayúscula, el `WHERE role IN (...)` lo saltea en silencio y esa persona queda sin ningún rol — sin error, sin aviso, sin acceso.

---

## 5 · Orden de implementación

| | Paso | Reversible | Riesgo |
|---|---|---|---|
| **M-1** | Crear `roles` y `tenant_user_roles`, vacías | Sí — `DROP` | Ninguno |
| **M-2** | Migrar datos + verificación de huérfanos | Sí | Ninguno: nada las lee todavía |
| **M-3** | Reescribir el cuerpo de `tiene_rol()` | Sí — cuerpo anterior | **Acá empieza a leerse** |
| **M-4** | `puede_otorgar_rol()` + trigger del último owner | Sí | Bajo |
| **M-5** | Validar `role` en las 8 rutas API contra `roles` | Sí | Medio — cierra D-3 |
| **M-6** | Migrar las 4 policies RLS a `tiene_rol()` | Sí | **Alto** — una por migración |
| **M-7** | UI de equipo con selección múltiple | Sí | Bajo |
| **M-8** | `NOT NULL` sin default en `tenant_users.role` | Sí | Bajo — cierra D-1 |
| **M-9** | *(semanas después)* `DROP COLUMN tenant_users.role` | **No** | Solo con backups |

**M-3 es la frontera.** Antes, el modelo nuevo es datos inertes. Después, gobierna B1.2 y B1.3.

**M-6 va de a una policy por migración.** Son cuatro tablas distintas y un error deja a la clínica sin poder facturar, sin plantillas de consentimiento o sin editar sus propios datos.

---

## 6 · Cómo se rompe esto

Lo que revisaría alguien que quiera encontrarle el agujero:

**`tiene_rol()` es `SECURITY DEFINER` y `authenticated` puede ejecutarla.** Usa `auth.uid()` internamente, no un parámetro, así que solo responde sobre quien la llama. Si alguna vez se le agrega un parámetro `p_user_id`, se convierte en un oráculo de permisos ajenos.

**`puede_otorgar_rol()` usa `max(jerarquia)`.** Con multirol, alguien que sea `admin` y `odontologo` a la vez tiene jerarquía 80. Correcto — pero significa que **los roles suman, nunca restan**. No existe un rol que quite permisos. Si en el futuro hace falta uno restrictivo, este modelo no lo soporta y hay que rediseñar.

**`ON DELETE CASCADE` sobre `auth.users`.** Borrar un usuario de Auth borra sus roles en silencio. Si era el último owner, el trigger **no se dispara** — los triggers de fila sí corren en cascadas, pero abortarlo dejaría el borrado de Auth a medias. Hay que decidir qué pasa: probablemente `ON DELETE RESTRICT` y forzar el traspaso antes.

**Las 8 rutas API leen `tenant_users.role` directamente.** Hasta M-5 conviven dos fuentes de verdad. Durante M-3 a M-5, un usuario puede tener `odontologo` en la tabla nueva y `admin` en la vieja, y el resultado depende de qué código lo consulte. **Esa ventana hay que cerrarla rápido o hacer que M-5 vaya junto con M-3.**

**RLS sobre las tablas nuevas.** `tenant_user_roles` necesita sus propias policies, o se convierte en la tabla que dice quién puede qué, legible por cualquiera. Y `roles` es catálogo público, pero **solo lectura** para `authenticated`: si alguien puede editar `jerarquia`, controla todo el modelo.

---

## 7 · Decisiones del owner

**DECISIÓN DEL OWNER 1 — ¿`odontologo` existe hoy?** El rol **no aparece en ninguna línea del código ni del esquema**. DO-6 lo definió, pero nunca se usó. ¿Se implementa ahora o se deja el catálogo en tres roles hasta que haya un odontólogo real que no sea vos?

**DECISIÓN DEL OWNER 2 — ¿un `admin` puede crear otro `admin`?** La jerarquía propuesta dice que sí (80 ≥ 80). Si preferís que solo el `owner` reparta administradores, la regla pasa a `>` estricto.

**DECISIÓN DEL OWNER 3 — ¿qué pasa al borrar un usuario de Auth?** `CASCADE` es cómodo y silencioso; `RESTRICT` obliga a traspasar roles antes y no deja huérfanos.

**DECISIÓN DEL OWNER 4 — ¿esto entra antes del lanzamiento?** Con 2 usuarios ambos `admin`, el modelo actual no lastima a nadie hoy. El riesgo aparece con la primera clínica que tenga secretaria. Si el piloto son 2-3 clínicas chicas donde todos son admin, esto puede ir después — **pero D-3 (invitar como `owner` sin validación) sí conviene cerrarlo antes**, y se cierra solo, sin todo el modelo.

---

## 8 · Lo que este documento no cubre

Permisos por operación dentro de un rol · roles a nivel plataforma (`admin_users` es otra cosa) · invitaciones pendientes con rol reservado · UI de auditoría de cambios de rol · qué ve cada rol en el dashboard.
