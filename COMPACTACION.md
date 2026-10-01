# DentalDesk · Evaluación y propuesta de compactación

**26/09/2026** · Qué conservar, qué terminar, qué borrar.

Criterio único: **¿esto le hace ganar o ahorrar plata a un odontólogo?** Lo que no pasa ese filtro no es "deuda técnica": es superficie que hay que mantener, auditar y explicar sin recibir nada a cambio.

---

# 0 · Superficie actual

| | |
|---|---|
| Páginas | 28 |
| Rutas API | 36 |
| LOC en `src` | **33.543** |
| Migraciones | 27 |
| Tablas con RLS | 23 |
| Tests | 31 archivos · 686 casos |
| **Documentación `.md`** | **57 archivos · 22.574 líneas** |

**La documentación pesa dos tercios del código.** Es el primer número que llama la atención y el más fácil de corregir.

---

# 1 · Corrección previa · el registro de asistencia SÍ existe

Antes de proponer recortes, hay que deshacer un recorte mal fundado.

El ciclo de vida real de una cita es:

```
pendiente → confirmado → asistio | ausente | cancelado
```

La agenda tiene el botón **"✓ Asistió"** (`agenda/page.tsx:1588`) y la inasistencia se registra con `fn_registrar_inasistencia` como `estado = 'ausente'`.

**Nadie escribe nunca `no_show`, y nadie escribe nunca `completado`.** Pero dos lugares los leen:

| Archivo | Lee | Resultado |
|---|---|---|
| `daily-briefing/route.ts` | `estado = 'completado'` | 0% de asistencia, todos los días |
| `bi/page.tsx:257` | `c.no_show` | 0 inasistencias, siempre |

**El dato está; las métricas preguntan por el campo equivocado.**

En agosto interpreté ese 0 como "el consultorio no registra asistencia" y saqué la métrica del briefing. Era al revés: había que corregir el nombre del estado.

## Acción

```
1. daily-briefing: 'completado' → 'asistio',  noShows → estado = 'ausente'
2. bi/page.tsx:257: c.no_show → c.estado === 'ausente'
3. Restaurar la tarjeta de asistencia y la fila de promedio semanal
4. Considerar eliminar la columna `no_show`: nadie la escribe y su
   existencia es lo que hizo creer que el dato no estaba
```

**Esto no es opcional.** La tasa de ausentismo es la métrica que justifica cobrar el plan Pro: sin ella no podés demostrarle a nadie que los recordatorios sirven.

---

# 2 · Borrar · sin valor y con costo de mantenimiento

## 2.1 · Documentación — el recorte más grande y más barato

**57 archivos, 22.574 líneas.** Tres veces durante la auditoría reaparecieron premisas ya refutadas —"no existe owner", "las policies de logos no se aplicaron"— porque siguen escritas en presente en documentos viejos.

**No es archivo muerto: es archivo que miente.**

### Conservar en la raíz — 6

| | |
|---|---|
| `LANZAMIENTO.md` | Runbook operativo |
| `OPERACION.md` | Conocimiento que no se deduce del código |
| `RELEASE_GATE_FINAL.md` | Evidencia del último gate |
| `RUNBOOK-COBROS.md` · `RUNBOOK-ARCA.md` | Facturación |
| `README.md` | |

### A `docs/historico/` — el resto

Los 19 archivos `P0-*` (9.500 líneas), las 7 auditorías previas, los 5 `RELEASE-*` superados, y los planes ya ejecutados o abandonados.

**Git los conserva igual.** El objetivo no es borrar historia: es que la raíz deje de contradecir al presente.

## 2.2 · Fidelización — quedó a medio sacar

El flag `FIDELIZACION_HABILITADA` la oculta, pero el sistema sigue cargando con ella:

- **7 archivos** la referencian todavía
- 3 funciones `SECURITY DEFINER` vivas: `fn_canjear_premio`, `fn_ajustar_puntos_manual`, `fn_aprobar_asistencia`
- 3 tablas: `premios`, `historial_puntos`, `config_fidelizacion`
- `src/app/actions/fidelizacion.ts` — que además contiene `registrarInasistenciaAction`, **que sí se usa**

**Cada función `SECURITY DEFINER` es superficie de seguridad que hay que auditar en cada revisión.** Tres de ellas son de una feature apagada.

### Acción

```
1. Mover registrarInasistenciaAction y aprobarAsistenciaAction
   a src/app/actions/citas.ts   ← se usan, no son de fidelización
2. Borrar el resto de actions/fidelizacion.ts
3. DROP de fn_canjear_premio y fn_ajustar_puntos_manual
4. Limpiar las referencias en los 5 archivos de UI
5. Las tablas: ver §2.4 antes de tocarlas
```

⚠️ **`fn_aprobar_asistencia` hay que leerla antes de borrarla.** La llama `aprobarAsistenciaAction`, que está activa: si además de dar puntos hace algo sobre el estado de la cita, borrarla rompe la agenda.

## 2.3 · Código sin ninguna referencia

| Qué | Refs en `src` | Veredicto |
|---|---|---|
| Tabla **`turnos`** | 0 | Legado — `citas` la reemplazó |
| Tabla **`whatsapp_contactos`** | 0 | Nunca se usó |
| Tabla **`presupuestos`** | 0 (solo en tests) | **Feature que nunca se construyó** |
| Columna **`no_show`** | solo lecturas roscas | Ver §1 |
| Ruta `api/sync-sheet` | trigger en `tgenabled='D'` | Inerte desde el 25/08 |
| `perfil_doctor` | 1 | Revisar si aporta sobre `tenants` |

**`presupuestos` es el caso más claro:** tiene tabla, RLS, policies, aparece en tres suites de test y en la vista de BI — y **ninguna línea de aplicación la lee o escribe.** Se está auditando y testeando una feature inexistente.

## 2.4 · Antes de cualquier `DROP`

```sql
SELECT 'turnos' t, count(*) FROM turnos
UNION ALL SELECT 'presupuestos',       count(*) FROM presupuestos
UNION ALL SELECT 'whatsapp_contactos', count(*) FROM whatsapp_contactos
UNION ALL SELECT 'premios',            count(*) FROM premios
UNION ALL SELECT 'historial_puntos',   count(*) FROM historial_puntos
UNION ALL SELECT 'config_fidelizacion',count(*) FROM config_fidelizacion
UNION ALL SELECT 'perfil_doctor',      count(*) FROM perfil_doctor;
```

**Con filas → exportar antes.** `historial_puntos` tenía 256 registros de 212 pacientes: es historia clínica-comercial real, no basura.

**Sin filas → `DROP` directo**, y salen solas de las tres suites de test y de las policies.

## 2.5 · La ruta `sync-sheet`

El trigger está desactivado y la planilla se identificó. Queda: borrar la ruta, y sacar de Vercel `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` y `SYNC_SHEET_SECRET`.

**Cuatro secretos menos que rotar y que aparecer en una auditoría.**

---

# 3 · Terminar, no borrar

## 3.1 · El export — y hay una promesa escrita que no se cumple

Hoy exporta **`pacientes`, `citas`, `facturas`**. No exporta `historial_dental`, `paciente_fotos`, `presupuestos`, `consentimientos_firmados`, `pagos` ni `tratamientos`.

Y la política de privacidad que escribimos en agosto dice, en §8, que al dar de baja una cuenta *"entregamos una exportación de los datos de la clínica dentro de los 30 días"*.

**No se puede cumplir.** Son seis consultas más y hojas nuevas en el mismo `.xlsx`; las fotos van como enlaces o ZIP aparte.

**No es una mejora: es cerrar una brecha entre lo que el sistema hace y lo que su política promete.**

## 3.2 · El rol `odontologo`

Existe en la UI y no hace nada distinto: 43 de las 47 policies son de pertenencia al tenant, no de rol. Una secretaria ve la misma historia clínica que el titular.

**Dos salidas, las dos válidas:**

**Sacarlo** hasta que exista autorización clínica real. Cuesta media hora y elimina una promesa implícita que no se cumple.

**Construirlo** — 4 policies nuevas. Solo si un cliente lo está pidiendo.

Lo que no se puede es dejarlo visible y **anunciarlo**.

---

# 4 · No tocar

Esto es el producto. Sostiene la facturación y funciona.

| Área | LOC | Por qué queda |
|---|---|---|
| **Pacientes** | 2.460 | La ficha clínica es el producto |
| **Agenda** | 2.156 | El uso diario · incluye `bloqueos`, que sí se usa |
| **Dashboard** | 1.720 | La pantalla de entrada |
| **Finanzas** | 1.473 | Caja, arqueo, costos |
| **Portal del paciente** | 1.184 | Diferencial real frente a una planilla |
| **BI** | 865 | En desarrollo activo · corregir §1 |
| **Reserva pública** | 376 | Capta turnos sin intervención |
| **Facturación ARCA** | 271 | Factura real emitida y verificada |
| **Consentimientos** | 106 | Hash SHA-256 + IP · valor médico-legal |
| **Enlaces cortos `/t`** | 162 | Un botón, un destino |

**WhatsApp se queda, y conviene decir por qué.** Son enlaces `wa.me` en ocho lugares que abren la app con el mensaje redactado. Es asistido, no automático — y para un consultorio chico eso es mejor: sin costo de Business API, sin aprobación de plantillas, y el profesional lee antes de enviar. **No es una feature a medias: es una decisión defendible.** Lo único que no existe es WhatsApp en el recordatorio automático, y eso hay que no prometerlo.

---

# 5 · Orden de ejecución

| | Qué | Tiempo | Gana |
|---|---|---|---|
| **1** | **Commitear y desplegar lo pendiente** | 15 min | Hace un mes que el recordatorio saltea en silencio |
| **2** | §1 · corregir `asistio` / `ausente` en briefing y BI | 30 min | Recupera la métrica que justifica el plan Pro |
| **3** | §2.1 · mover 51 `.md` a `docs/historico/` | 20 min | Deja de contradecirse a sí mismo |
| **4** | §2.4 · contar filas y `DROP` lo vacío | 1 h | −3 tablas, −2 funciones SECURITY DEFINER |
| **5** | §3.1 · completar el export | 2 h | Cierra la brecha con la política |
| **6** | §2.2 · terminar de sacar fidelización | 2 h | −7 archivos de referencias |
| **7** | §3.2 · decidir `odontologo` | 30 min o 4 h | Deja de prometer lo que no hay |
| **8** | §2.5 · borrar `sync-sheet` y sus secretos | 30 min | −4 secretos |

**Total sin el 5 y el 7: menos de un día.**

---

# 6 · Lo que esta evaluación no cambia

**El bloqueante sigue siendo backups**, y no se mueve con nada de lo de acá.

- Sin backup automático de la base — RPO infinito
- **Sin backup de Storage, y PITR no lo va a cubrir** — las fotos clínicas no tienen copia de ningún tipo
- Los scripts están escritos y sin correr: `respaldar-storage.sh`, `verificar-respaldo-storage.sh`

Compactar el producto lo hace más defendible y más barato de mantener. **No lo hace recuperable.**
