# DentalDesk — Qué hicimos y qué falta

**Fecha:** 12 de agosto de 2026
**Para leer sin conocimientos técnicos.**

---

## 1. De qué se trata todo esto

DentalDesk guarda información de salud: historias clínicas, alergias, antecedentes, fotos, datos de contacto y la facturación de cada consultorio. Cuando un sistema guarda ese tipo de información, hay tres cosas que tienen que funcionar siempre:

1. **Que los datos de una clínica no se mezclen con los de otra.**
2. **Que solo entre quien tiene que entrar.**
3. **Que nada se filtre hacia afuera sin querer.**

Lo que hicimos fue revisar el sistema entero buscando fallas en esos tres puntos, comprobar cuáles eran reales, y empezar a corregirlas.

Un punto importante sobre el método: **no dimos nada por sentado.** Cada problema que encontramos leyendo el código lo verificamos después contra el sistema real. Varias veces eso cambió el diagnóstico —para bien y para mal— y en dos ocasiones descubrió errores que teníamos en la propia solución.

---

## 2. Lo que encontramos

### 2.1 Una ventana abierta a la facturación · **GRAVE — ya cerrado**

**Qué pasaba.** El sistema tenía seis "resúmenes" internos —tablas de números— que estaban configuradas para que **cualquiera pudiera consultarlas desde internet, sin usuario ni contraseña**.

Es como si la puerta del consultorio estuviera cerrada con llave, pero al costado hubiera una ventana sin postigo dando a la calle, con la planilla de facturación apoyada del lado de adentro.

**Qué se veía.** Lo comprobamos en vivo. Con una sola línea escrita en una terminal, sin identificarse de ninguna manera, el sistema devolvía:

| Mes | Turnos | Facturación |
|---|---:|---:|
| Septiembre | 18 | $1.305.000 |
| Agosto | 91 | $6.905.000 |
| Julio | 120 | $9.105.000 |
| Junio | 126 | $9.242.000 |
| Mayo | 123 | $6.198.000 |
| Abril | 84 | $2.586.190 |
| **Total** | **562** | **$35.341.190** |

Y por las otras cinco ventanas: el precio promedio por tratamiento, cuántos pacientes distintos atiende, y en qué horarios trabaja.

**No había datos de pacientes** —ni nombres, ni historias clínicas—. Eran números agregados. Pero eran los números del negocio de tu cliente, legibles por cualquiera que supiera dónde mirar.

**Qué hicimos.** Cerramos el acceso. Ahora esas seis consultas devuelven "permiso denegado". Lo verificamos de dos formas independientes: preguntándole a la base de datos quién tiene permiso, y volviendo a intentar la consulta desde afuera.

**Lo que no sabemos:** si alguien entró antes de que lo cerráramos. El sistema solo guarda registro de accesos de los últimos días, y esto estuvo abierto durante meses. **No podemos afirmar que nadie entró.** Tampoco hay nada que indique que alguien lo hizo.

---

### 2.2 Llaves de pacientes yéndose a un servicio externo · **GRAVE — arreglado, falta publicar**

**Qué pasaba.** Cada paciente recibe por WhatsApp o email un link personal para ver su ficha: sus turnos, su historial, sus fotos. Ese link **funciona como una llave**: quien lo tiene, entra.

El sistema usa un servicio externo llamado Sentry para registrar errores —una especie de cámara de seguridad que avisa cuando algo se rompe. Pero estaba configurada para grabar **de más**: guardaba la dirección completa de cada página visitada, y esa dirección **contiene la llave del paciente**.

Es como si la cámara de seguridad, además de filmar la puerta, filmara la llave en primer plano cada vez que alguien la usa.

**Qué encontramos, con números.** Al revisar Sentry aparecieron **cuatro llaves de pacientes distintas**, guardadas completas, junto con sus direcciones de internet. El problema venía desde hacía dos meses.

Y hay un agravante: **esas llaves no vencen nunca.** Están así desde que se creó el sistema. Quien tenga una, entra hoy, mañana y dentro de un año.

**Qué hicimos.** Reprogramamos la forma en que el sistema le informa los errores a Sentry. Ahora, antes de mandar nada, tacha automáticamente:

- las llaves de los pacientes
- las direcciones de internet de quien visita
- las cookies de sesión
- cualquier contraseña o clave que aparezca en el camino
- los datos clínicos que pudieran ir en un formulario

Y deja pasar lo que sirve para arreglar problemas: qué error fue, dónde ocurrió, en qué navegador.

**Cómo lo comprobamos.** Acá pasó lo más interesante del proceso.

Primero escribimos 50 pruebas automáticas. Las cincuenta pasaron. Pero cuando comparamos contra un caso real de tu sistema, **descubrimos que el arreglo tenía dos agujeros** que las pruebas inventadas no habían encontrado: la llave seguía saliendo por un campo que no habíamos mirado, y la dirección de internet se colaba disfrazada de identificador de usuario.

Los tapamos, agregamos pruebas usando los datos reales, y después lo probamos **en un entorno de verdad**. Ahí apareció un tercer camino que tampoco habíamos previsto —y que ya estaba cubierto.

La lección: las pruebas inventadas dan confianza falsa. Hizo falta el dato real.

**Estado.** Funciona y está verificado. **Pero todavía no está publicado**, así que hoy el problema sigue ocurriendo.

---

### 2.3 Los tabiques entre clínicas · **REVISADO — están bien**

DentalDesk está pensado para atender varias clínicas con un mismo sistema. Eso exige tabiques internos que impidan que los datos de una lleguen a otra.

Encontramos **dos formas en que esos tabiques podían fallar**:

- Un mecanismo automático que, al crear un turno, buscaba al paciente **solo por su email** — sin fijarse de qué clínica era. Si la misma persona fuera paciente de dos clínicas, podía quedar mezclada.
- Varias tablas configuradas para que, si alguien se olvidaba de indicar la clínica, el dato **se asignara solo a una clínica real** en lugar de dar error.

**Qué hicimos.** Revisamos toda la información existente con tres consultas distintas.

**Resultado: cero problemas.** Ni un solo turno, historia clínica, foto, pago o factura está atribuido a la clínica equivocada.

Los caminos por los que podría pasar siguen abiertos, pero **nunca llegaron a producir daño**. Es una de las mejores noticias de toda la revisión: no hay que reparar nada, solo cerrar la puerta antes de que entre la segunda clínica.

---

### 2.4 Un secreto viajando a la vista · **arreglado, falta publicar**

El sistema tiene tareas que corren solas todos los días a las 8 de la mañana: mandar recordatorios de turno, avisos, campañas.

Para que nadie más pueda dispararlas, están protegidas con una contraseña interna. El problema: esa contraseña **viajaba escrita en la dirección de internet**, donde queda registrada en varios lugares.

Lo cambiamos para que viaje oculta, como corresponde. Ya está arreglado y probado, pendiente de publicar.

---

## 3. Qué falta hacer

Ordenado por urgencia. Los tiempos son estimados de trabajo, no de espera.

### Ahora — 1 hora

| # | Qué | Por qué | Riesgo |
|---|---|---|---|
| **1** | **Publicar el arreglo de Sentry** | Es lo único que corta la fuga. Hoy, cada vez que un paciente abre su ficha, su llave se sigue guardando en el servicio externo | Bajo — probado en tres entornos, y se puede revertir en segundos |
| **2** | Cambiar la contraseña interna de las tareas automáticas | Estuvo a la vista durante meses. Cambiarla cuesta dos minutos y cierra la duda de si alguien la vio | Bajo |
| **3** | Al día siguiente: confirmar que salieron los recordatorios | Es la única forma de saber que no rompimos nada | — |

**Los tres van juntos en una sola publicación.**

### Esta semana — medio día

| # | Qué | Por qué |
|---|---|---|
| **4** | Borrar de Sentry los registros viejos que contienen las llaves | El arreglo evita que pase de ahora en más, **pero no borra lo ya guardado** |
| **5** | Cambiarles la llave a los 4 pacientes afectados | Sus llaves actuales quedaron expuestas y no vencen nunca |
| **6** | Terminar el cierre de las seis ventanas de facturación | Hoy están tapadas pero siguen existiendo. Conviene eliminarlas para que nadie las reabra sin entender por qué se cerraron |

### Próximas semanas — es donde está el trabajo real

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| **7** | **Que las llaves de pacientes venzan** | Hoy son eternas. Una llave que se filtró en un WhatsApp reenviado sirve para siempre | 3-4 días |
| **8** | **Cerrar los caminos de mezcla entre clínicas** | No hicieron daño, pero hay que cerrarlos **antes** de sumar la segunda clínica | 3-5 días |
| **9** | **Separar permisos por rol** | Hoy la recepcionista puede ver y modificar exactamente lo mismo que el dueño: historias clínicas, alergias, antecedentes, finanzas. La pantalla le esconde opciones, pero los datos están accesibles igual | 1 semana + una decisión tuya |
| **10** | **Facturación electrónica a prueba de fallos** | Si AFIP autoriza una factura y justo falla la conexión, **el comprobante queda emitido ante el fisco y sin registro en el sistema**. No detectamos que haya pasado, pero puede pasar | 2-3 semanas |

---

## 4. Lo que necesita una decisión tuya

Estas no las puede tomar quien programa. Son de negocio.

### A · ¿Qué puede ver una recepcionista?

Hoy: **todo**. Historias clínicas, alergias, antecedentes, ingresos, egresos, rentabilidad.

Hay que decidir qué corresponde. Mi sugerencia:

- Historia clínica → **puede leer, no puede modificar**
- Cobrar un turno → **sí**
- Ver la rentabilidad del consultorio → **no**

### B · ¿Cuánto debe durar la llave de un paciente?

Hoy: **para siempre**.

Sugerencia: **30 días, renovándose sola cada vez que se le manda un recordatorio.** Un paciente activo nunca ve un link vencido; uno que dejó de venir pierde el acceso solo.

### C · ¿Se avisa a alguien?

Cuatro pacientes tuvieron su llave guardada en un servicio externo durante hasta dos meses. No hay indicios de que alguien la haya usado, pero tampoco podemos descartarlo.

Es una decisión que conviene conversar con la clínica, y eventualmente con un abogado. Depende de qué obligaciones aplican a los datos de salud en tu caso.

### D · ¿Se mantiene la sincronización con Google Sheets?

Hay una función que copiaría los turnos a una planilla de Google. **Nunca funcionó** —está mal configurada desde que se instaló— y nadie la reclamó.

Además está mal diseñada: volcaría los datos de **todas** las clínicas a una misma planilla.

Sugerencia: **eliminarla.** Si alguna vez hace falta, se rehace bien.

---

## 5. En una página

**Lo que estaba mal y ya está resuelto**

- La facturación de la clínica era consultable desde internet sin contraseña. **Cerrado.**
- Las llaves de los pacientes se guardaban en un servicio externo. **Arreglado, falta publicar.**
- Una contraseña interna viajaba a la vista. **Arreglado, falta publicar.**

**Lo que revisamos y está bien**

- Ningún dato de un paciente quedó atribuido a la clínica equivocada.
- El cobro con MercadoPago está bien construido.
- Las fotos clínicas están correctamente protegidas.
- El link corto que reciben los pacientes por WhatsApp está bien diseñado.

**Lo que falta**

- Publicar lo que ya está arreglado. **Es lo más urgente.**
- Limpiar lo que quedó guardado de antes.
- Que las llaves venzan.
- Separar permisos por rol.
- Blindar la facturación electrónica.

**Lo más importante de todo:** el punto 1 de la lista. Todo lo demás puede esperar unos días. Eso no, porque el problema **sigue ocurriendo mientras tanto**: cada paciente que abre su ficha deja su llave guardada en un servicio externo.

---

*Este resumen acompaña a los informes técnicos `AUDITORIA-PROFUNDA-2026-08.md`, `P0_IMPLEMENTATION_PLAN.md`, `P0_PRODUCTION_DIAGNOSTICS.md` y `P0-03_PRODUCTION_VERIFICATION.md`, donde está el detalle con archivos, líneas y evidencia.*
