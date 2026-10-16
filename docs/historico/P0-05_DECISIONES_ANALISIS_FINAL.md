# P0-05 · Análisis final de decisiones — DO-2 a DO-8

**Fecha:** 20/08/2026 · **Instancia de decisión y diseño. Nada implementado.**

> Todas las recomendaciones se apoyan en evidencia de producción ya documentada en la bitácora.
> Donde no hay evidencia suficiente, está dicho explícitamente.

---

### DO-2 — Límite de ajuste manual de puntos

**Recomendación:** **±500 puntos por operación**, como constante nombrada dentro de la función.
**Estado:** LISTA PARA APROBAR

**Por qué:**

1. **Piso técnico verificado: 390.** El movimiento legítimo más grande en la historia del sistema es un `gasto_tratamiento` de 390 puntos — un tratamiento de $390.000. Cualquier límite menor bloquearía la corrección de un caso real ya ocurrido.
2. **Techo con margen para inflación.** `ars_por_punto = 1000` es **fijo**. Un tratamiento de $390.000 hoy será rutinario en meses, y acreditará más puntos. 400 quedaría corto solo por el paso del tiempo; 500 da 28% de margen.
3. **Costo de adopción cero.** `ajuste_manual` y `ajuste_reverso` tienen **0 filas históricas**. Ningún ajuste pasado incumpliría. No hay migración ni excepciones que arrastrar.

**Impacto en seguridad:** acota el daño de una operación individual a **$25.000** al canje. Sin límite, un error de tipeo —agregar un cero— es hoy indetectable hasta que alguien concilie.

**Impacto operativo:** **nulo en la práctica.** Cero ajustes en cinco meses. Si alguna vez 500 queda corto, el admin recibe una excepción visible en la UI, no un fallo silencioso.

**Impacto técnico:** tres líneas dentro de `fn_ajustar_puntos_manual`, debajo de la validación de tenant que ya existe. No toca la firma ni el contrato de la función.

**Qué desbloquea:** el diseño de **B1.2**.

**Riesgos de esta decisión:**

**Un límite por operación no es un tope acumulado.** Nada impide diez ajustes de 500 en un minuto. **500 acota el error, no el fraude.**

Contra el fraude, el control real es otro y ya existe: `historial_puntos` es un ledger append-only de hecho —ningún código hace UPDATE ni DELETE sobre él— que guarda `aprobado_por_usuario_id`, `saldo_resultante` y, con DO-3, la nota. **Diez ajustes seguidos dejan diez filas con nombre y apellido.**

**Recomiendo NO agregar un límite acumulado ahora.** Con 0 ajustes históricos no hay base para calibrarlo, y un tope diario mal elegido rompe operaciones legítimas sin evidencia que lo justifique. Si alguna vez aparecen ajustes en volumen, ahí sí hay datos para diseñarlo.

**Alternativa descartada:** 250, o un tope acumulado diario.
**Motivo del descarte:** 250 no cubre los 390 verificados. El tope acumulado es prematuro: sería un número inventado sobre cero observaciones, exactamente lo que este proceso viene evitando.

---

### DO-3 — Nota obligatoria en el ajuste manual

**Recomendación:** **Sí, obligatoria.** Rechazar `NULL`, vacío, solo espacios, y el texto autogenerado `'Ajuste manual de puntos'`. **Mínimo 10 caracteres tras `trim`.**
**Estado:** LISTA PARA APROBAR

**Por qué:**

1. **Hoy la función miente.** `COALESCE(p_nota, 'Ajuste manual de puntos')` **inventa la nota** cuando llega `NULL`. Un ajuste sin justificación queda indistinguible de uno justificado. Eso no es un vacío de auditoría: es un registro que aparenta completitud.
2. **El *por qué* es lo único irrecuperable.** El ledger ya reconstruye quién, cuándo, cuánto y sobre quién. La razón no se deduce después.
3. **Costo cero.** 0 filas históricas. El 100% de los ajustes futuros cumple desde el primer día, sin backfill ni excepciones.

**Impacto en seguridad:** convierte el ajuste de puntos en una operación que exige justificarse. Es fricción deliberada sobre una operación que mueve dinero.

**Impacto operativo:** mínimo, **si la UI ya envía el campo**. Verifiqué que `ajustarPuntosManualAction` recibe `nota: string` como parámetro obligatorio en TypeScript, así que el camino existe. **Falta confirmar que el formulario lo exija** — eso es una verificación de UI, no de base.

**Impacto técnico:** quitar el `COALESCE` y agregar la validación. Mismo bloque que DO-2.

**Sobre el mínimo de 10 caracteres:** es un juicio, no una derivación de los datos. Su función es rechazar `"."`, `"x"`, `"ok"` — notas que cumplen la letra y no el propósito. Diez caracteres obligan a una frase corta (*"error de carga"* son 14). **Si te parece arbitrario, se puede bajar a 5 o quitar; no cambia el resto del diseño.**

**Qué desbloquea:** **B1.2**, junto con DO-2.

**Riesgos de esta decisión:** si el formulario permite enviar sin nota, el flujo se rompe en producción. **Mitigación obligatoria: verificar la UI antes de aplicar.**

**Alternativa descartada:** dejar el `COALESCE` y solo rechazar `NULL`.
**Motivo del descarte:** el texto autogenerado es indistinguible de uno escrito a mano. Sin rechazarlo explícitamente, la validación es decorativa.

---

### DO-4 — ¿El odontólogo puede canjear premios?

**Recomendación:** **No.** `fn_canjear_premio` restringida a `owner`, `admin` y `staff`.
**Estado:** LISTA PARA APROBAR

**Por qué:**

1. **El canje entrega valor económico, no atención clínica.** Cada punto vale $50 al canjearse. Descuenta stock y saldo. Es una operación de caja: pertenece al eje administrativo, no al clínico.
2. **Separación de funciones.** El odontólogo genera los puntos —su tratamiento dispara `gasto_tratamiento`— y no debería además poder convertirlos en valor. Quien origina el crédito no debería liquidarlo.
3. **Costo operativo real: cero.** `canje_premio` tiene **0 filas**. Nadie canjeó un premio nunca en la historia del sistema.

**Impacto en seguridad:** cierra el circuito completo *generar puntos → canjearlos* en manos de una sola persona. Es control de fraude clásico, aplicado a una superficie chica.

**Impacto operativo:** **acá está el matiz importante, y lo resuelve DO-6.**

Con el modelo multirol, el dueño que además atiende tiene `owner` **y** `odontologo`. **Puede canjear igual**, por su rol de owner. La restricción solo alcanza a un odontólogo contratado sin rol administrativo — que es exactamente a quien se quiere alcanzar.

Sin multirol, esta decisión habría creado fricción real en un consultorio de una sola persona. **DO-6 la vuelve inocua.**

**Impacto técnico:** mismo patrón que B1.2: verificación de rol dentro del cuerpo, debajo de la validación de tenant existente. La función ya valida premio activo, stock, saldo y pertenencia al tenant — solo falta el rol.

**Qué desbloquea:** **B1.3**.

**Riesgos de esta decisión:** si en el futuro el consultorio contrata un odontólogo que atiende solo, un paciente que quiera canjear tendría que esperar a que haya alguien administrativo. **Riesgo bajo y reversible con un `GRANT` de rol adicional.**

**Alternativa descartada:** permitirlo a los cuatro roles.
**Motivo del descarte:** con 0 canjes históricos, no hay demanda operativa que justifique la superficie extra.

---

### DO-5 — ¿Aplicar B1.4?

**Recomendación:** **Sí — B1.4 junto con la corrección de la UI, en el mismo cambio.**
**Estado:** LISTA PARA APROBAR ⚠️ **requiere excepción explícita a la contención**

**Por qué:**

1. **Sin la corrección, B1.4 es peor que no hacer nada.** RLS deniega devolviendo **0 filas con `error = null`**. La UI infiere éxito de la ausencia de error, así que le diría *"Paciente eliminado"* a alguien cuyo borrado fue rechazado. **Un control que deniega en silencio y reporta éxito produce una creencia falsa sobre datos clínicos.**
2. **La cobertura es total.** Verificado: existe **una sola ruta** que borra pacientes (`pacientes/page.tsx:139`) y usa el cliente `authenticated`. No hay camino `service_role`. Una policy RLS cubre el 100% de las rutas del código.
3. **El bug de la UI existe hoy, con B1.4 o sin él.** La lectura de `error` es semánticamente incorrecta ahora mismo. B1.4 no lo crea: lo vuelve alcanzable.

**Impacto en seguridad:** restringe la destrucción de historia clínica, ledger de puntos y recordatorios a `owner`/`admin`. Y elimina una clase de falso positivo en la UI.

**Impacto operativo:** **nulo hoy.** Los dos usuarios son `admin`. Cierra la puerta antes de que entre alguien.

**Impacto técnico:**

- **Base:** separar la policy `FOR ALL` en `SELECT/INSERT/UPDATE` para todos y `DELETE` para `owner`/`admin`.
- **UI:** `src/app/pacientes/page.tsx` debe pedir el conteo de filas afectadas y distinguir **tres** desenlaces —borrado, denegado por permisos, error de base— en vez de dos.
- **Extra:** traducir el error `23503` de la FK de `presupuestos`, que hoy se muestra crudo y en inglés.

**Qué desbloquea:** **B1.4** completo.

**Riesgos de esta decisión:** **rompe la regla de contención *"cero archivos de `src/` modificados"*.** Es la única de las siete que lo hace. Necesito tu confirmación explícita.

Dato que baja el riesgo: `presupuestos` tiene **0 filas**, así que el borrado funciona hoy y se puede probar de punta a punta.

**Alternativa descartada:** aplicar B1.4 sin tocar la UI.
**Motivo del descarte:** no es defendible. Produce un mensaje de éxito falso sobre una operación destructiva.

---

### DO-6 — Modelo de roles 🔴

**Recomendación:** **Opción B — multirol con tabla de asociación**, `owner` · `admin` · `odontologo` · `staff`, con vocabulario garantizado por integridad referencial.
**Estado:** LISTA PARA APROBAR

**Por qué:**

1. **El modelo actual no representa tu propio caso.** `tenant_users.role` es **una sola columna `text`**. Con un valor por usuario, el dueño que además ejerce tiene que elegir entre administrar el negocio y atender clínicamente. En un consultorio chico ese no es un borde: es *el* caso.
2. **`owner` y `odontologo` responden preguntas distintas.** `owner` es **propiedad**: quién es dueño, uno solo, no delegable. `odontologo` es **función**: qué hace, varios posibles, contratable, rotativo. Hoy comparten columna porque históricamente solo existían `owner` y `admin`, ambos administrativos. Agregar roles funcionales rompe esa homogeneidad.
3. **Evita una segunda migración.** Un `CHECK` sobre un eje único —opción A— cementa el modelo insuficiente. Cuando aparezca el primer usuario con dos funciones hay que migrar igual, **pero con más datos y más políticas escritas encima**.

**Impacto en seguridad:**

- **Vocabulario garantizado por FK, no por `CHECK`.** Una tabla catálogo de roles rechaza cualquier valor inventado por integridad referencial. Es **más fuerte** que un `CHECK` de texto y cierra la mitad de R-2 sin tocar `src/`.
- **Permite jerarquía.** Con roles como filas se puede expresar "quién puede otorgar qué rol" — necesario para cerrar la otra mitad de R-2.
- **Costo:** cada policy RLS pasa de `role IN (…)` a un `EXISTS` sobre la tabla de asociación. Más superficie donde equivocarse. **Se mitiga con una función auxiliar única** —del estilo `tiene_rol(tenant, roles[])`— usada por todas las policies, en vez de repetir el `EXISTS`.

**Impacto operativo:** el dueño que ejerce tiene `owner` + `odontologo` y no pierde ninguna capacidad. Recepción puede sumar `staff` + `odontologo` si asiste clínicamente. **El modelo deja de forzar elecciones falsas.**

**Impacto técnico — es el cambio más grande de P0-05:**

| Qué | Alcance |
|---|---|
| Tabla catálogo de roles + tabla de asociación usuario↔rol | Nueva |
| Migración de datos | Trivial: **2 filas, ambas `admin`** |
| Políticas RLS atadas al rol | **4** — `arca_config_write`, `plantillas_write`, `crm_campanas_write`, `tenants_update_own` |
| Rutas de API que comparan contra `role` | **5** — `equipo/invitar`, `equipo/miembros`, `facturacion/anular`, `facturacion/config`, `pacientes/exportar` |
| `tenant_users.role` | Queda como columna heredada durante la transición, luego se retira |

**Nota sobre tu formulación de la opción B.** La planteaste como *"roles múltiples / enum o CHECK de roles"*. Son cosas distintas: **un enum o un `CHECK` sigue siendo un eje único** — restringe el vocabulario pero no permite dos roles por usuario. **El multirol exige tabla de asociación.** Tu decisión —*"un usuario puede tener múltiples roles cuando corresponda"*— es inequívoca, así que asumo la tabla.

**Qué desbloquea:** **B1.5b** y **todo el diseño de la Fase 2**. También reformula B1.7/G-3, cuya guarda de vocabulario asumía columna única.

**Riesgos de esta decisión:**

- **Es la migración más invasiva del proyecto.** 4 políticas + 5 rutas. Cada una es una oportunidad de introducir un agujero.
- **Complejidad permanente** en cada policy nueva.
- **B1.5a queda sin sentido.** Cambiar el `DEFAULT` de una columna que va a desaparecer es trabajo tirado. **Recomiendo eliminar B1.5a del plan.**
- **Ventana de transición:** mientras convivan `tenant_users.role` y la tabla nueva, hay dos fuentes de verdad. Debe ser corta y estar cubierta por tests.

**Alternativas descartadas:** A (booleano `es_dueno` + rol único) y C (convivir con el modelo actual).

**Motivo del descarte:**

**A** resuelve el caso concreto del dueño que ejerce, pero mantiene un eje funcional único: un usuario sigue sin poder ser odontólogo **y** recepción. Y su costo de migración —reescribir 4 políticas y 5 rutas— **es idéntico al de B**. Se paga lo mismo por menos.

**C** tiene costo cero hoy y se paga en cada política futura: hay que decidir caso por caso si `owner` cuenta como clínico. Es deuda que se acumula justo donde más duele — en las reglas de autorización.

---

### DO-7 — Excepción de contención para R-2

**Recomendación:** **Sin excepción.** Cerrar el vocabulario por integridad referencial dentro de DO-6, **y agregar verificación de jerarquía en la misma Fase 2.**
**Estado:** LISTA PARA APROBAR ⚠️ **con una salvedad que hay que asumir explícitamente**

**Por qué:**

1. **El riesgo actual es bajo y medible.** `tenant_users` tiene **2 filas, ambas `admin`, una clínica**. Ningún valor inventado, ningún `owner` creado por un admin. **La vulnerabilidad existe en el código pero nunca se usó.**
2. **DO-6 la cierra estructuralmente.** Con la tabla de asociación y FK al catálogo, un rol inventado se rechaza en la base. No hace falta una lista blanca en `/api/equipo/invitar`: **la corrección deja de depender de que alguien se acuerde de validar.**
3. **Tocar `src/` ahora sería tocarlo dos veces.** Esa ruta hay que reescribirla igual para el modelo multirol. Una lista blanca hoy se tira a la basura en Fase 2.

**⚠️ La salvedad — DO-7 cierra la mitad de R-2:**

Rechazar valores fuera del vocabulario impide insertar texto arbitrario. **Pero `owner` es un valor válido del vocabulario.** Un `admin` va a poder seguir invitando a alguien como `owner`, o auto-invitarse con otro email.

**La escalada de privilegios permanece abierta** hasta que exista una regla explícita de jerarquía: *quien invita no puede asignar un rol superior al propio*, o *solo un `owner` puede otorgar `owner`*.

**Recomiendo incorporar esa regla al diseño de Fase 2**, no dejarla implícita. Si se aprueba DO-7 sin esto, R-2 queda parcialmente abierto por tiempo indefinido, y eso debe quedar registrado como riesgo aceptado.

**Impacto en seguridad:** el vocabulario queda cerrado por estructura. La jerarquía queda pendiente. **Riesgo residual explícito: escalada `admin → owner`.**

**Impacto operativo:** ninguno. Dos usuarios de confianza.

**Impacto técnico:** cero fuera de DO-6. La verificación de jerarquía es una condición adicional en la ruta de invitación, dentro del mismo cambio.

**Qué desbloquea:** confirma que **R-2 se cierra en Fase 2**, no en Fase 1.

**Riesgos de esta decisión:** si Fase 2 se demora, R-2 sigue abierto. **Mitigación:** dejarlo en el tablero de la bitácora como riesgo aceptado con fecha, no como hallazgo cerrado.

**Alternativa descartada:** lista blanca temporal en `/api/equipo/invitar` ahora.
**Motivo del descarte:** trabajo que se descarta en Fase 2, y rompe la contención por un riesgo que la evidencia muestra no explotado.

---

### DO-8 — ¿El odontólogo administra plantillas de consentimiento?

**Recomendación:** **No.** Crear, modificar y eliminar plantillas queda en `owner`/`admin`. El odontólogo **usa** las plantillas y firma consentimientos.
**Estado:** LISTA PARA APROBAR

**Por qué:**

1. **La plantilla es configuración; el consentimiento firmado es operación clínica.** Son dos objetos distintos: `plantillas_consentimiento` y `consentimientos_firmados`. Restringir la primera **no limita** la capacidad del odontólogo de hacer firmar.
2. **Es un documento con valor legal.** `consentimientos_firmados` guarda `contenido_snapshot` —el texto exacto firmado— más `hash_sha256`, `firma_png`, `ip_firma` y `user_agent`. Todo eso existe para sostener el consentimiento ante un cuestionamiento. **Quien puede editar la plantilla determina qué acepta el paciente.**
3. **La política vigente ya lo hace.** `plantillas_write` permite `role IN ('admin','owner')`. **Esta decisión no requiere cambio alguno**: confirma el estado actual.

**Impacto en seguridad:** el texto legal tiene un conjunto acotado de editores. Con el snapshot inmutable, un cambio de plantilla no altera consentimientos ya firmados.

**Impacto operativo:** un odontólogo contratado que detecte un error en un texto tiene que pedir la corrección. **Fricción real pero baja**, y adecuada para un documento legal.

Y como en DO-4: **con multirol, el dueño que ejerce tiene `owner` y edita igual.** La restricción alcanza solo al contratado.

**Impacto técnico:** **ninguno.** La política ya es correcta.

**Qué desbloquea:** cierra la contradicción que había señalado entre la matriz y el comportamiento vivo. **No era un defecto: era una decisión sin tomar.**

**Riesgos de esta decisión:** si el consultorio crece y el odontólogo es quien conoce el texto clínico correcto, la dependencia del admin puede volverse cuello de botella. **Reversible con un cambio de política.**

**Alternativa descartada:** permitir crear y modificar, pero no eliminar.
**Motivo del descarte:** modificar es donde está el riesgo, no eliminar. Una plantilla borrada es visible; una modificada sutilmente, no. Sería complejidad sin ganancia.

---

## MATRIZ FINAL DE DECISIONES

| Decisión | Recomendación | Motivo principal | Desbloquea |
|---|---|---|---|
| **DO-2** | **±500 puntos por operación** | Piso verificado 390 + margen por inflación; 0 ajustes históricos | B1.2 |
| **DO-3** | **Nota obligatoria, mín. 10 caracteres** | Hoy la función inventa la nota; costo de adopción cero | B1.2 |
| **DO-4** | **No — `owner`/`admin`/`staff`** | El canje es caja, no clínica; multirol lo vuelve inocuo | B1.3 |
| **DO-5** | **Sí, con la corrección de la UI** | Sin ella el control deniega en silencio y reporta éxito | B1.4 ⚠️ toca `src/` |
| **DO-6** | **Multirol con tabla de asociación** | Es el único modelo que representa al dueño que ejerce | B1.5b + Fase 2 |
| **DO-7** | **Sin excepción; cerrar en DO-6** | La estructura lo cierra mejor que una lista blanca | R-2 → Fase 2 ⚠️ parcial |
| **DO-8** | **No — queda en `owner`/`admin`** | La plantilla es configuración legal, no operación clínica | Fase 2 · sin cambio |

---

## PROPUESTA DE APROBACIÓN

Copiá y ajustá lo que no te cierre:

```
DO-2: aprobar          (500 puntos por operación)
DO-3: aprobar          (nota obligatoria, mínimo 10 caracteres)
DO-4: aprobar          (odontólogo NO canjea)
DO-5: aprobar          (B1.4 + corrección de UI — autoriza tocar src/)
DO-6: aprobar          (multirol con tabla de asociación)
DO-7: aprobar          (sin excepción; R-2 se cierra en Fase 2)
DO-8: aprobar          (plantillas quedan en owner/admin)
```

**Tres puntos que conviene que respondas aunque apruebes todo:**

**1 · DO-5 autoriza modificar `src/app/pacientes/page.tsx`.** Es la única decisión que rompe la contención. Necesito confirmación explícita, no implícita.

**2 · DO-7 deja R-2 parcialmente abierto.** El vocabulario se cierra; la escalada `admin → owner` no. ¿Se incorpora la regla de jerarquía al diseño de Fase 2, o se acepta como riesgo documentado?

**3 · DO-6 elimina B1.5a.** Cambiar el `DEFAULT` de una columna que va a desaparecer es trabajo tirado. **Recomiendo sacarlo del plan.** ¿Lo confirmás?

---

*Análisis de decisiones. Nada implementado, ninguna migración creada, ningún archivo de código modificado, nada ejecutado contra producción.*
