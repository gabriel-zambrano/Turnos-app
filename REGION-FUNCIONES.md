# Región de las funciones · `iad1` → `pdx1`

**25/08/2026 · Cambio de una línea en `vercel.json`. NO desplegado.**

---

## El problema

```
Supabase                us-west-2  (Oregon)
Funciones de Vercel     iad1       (Virginia)
```

**Costas opuestas de Estados Unidos.** Cada consulta a la base cruza el país: ~60-70 ms de ida y vuelta.

Y una página de esta app no hace una consulta. El dashboard, la agenda y el listado de pacientes cargan varias tablas cada uno. Ese costo se multiplica por consulta, no por página.

## El cambio

```json
{ "regions": ["pdx1"] }
```

`pdx1` es Portland = `us-west-2`. **La misma región que Supabase.** El salto función↔base pasa de ~65 ms a ~2 ms.

Disponible en el plan Hobby sin costo adicional: Vercel habilitó la selección de región para todos los planes. Hobby permite **una** región; Pro permite varias.

## La contrapartida, que es real

| Salto | Hoy (`iad1`) | Con `pdx1` |
|---|---|---|
| Usuario (Argentina) → función | ~120 ms | ~180 ms |
| Función → Supabase, **por query** | ~65 ms | ~2 ms |

**Se paga ~60 ms más en el salto del usuario, una sola vez por request.** Se ahorran ~63 ms **por cada consulta** a la base.

El cambio conviene si una página hace **2 o más queries**. Esta app hace bastante más que dos en sus pantallas principales.

⚠️ **Una página que hiciera una sola consulta sería más lenta.** No creo que exista ninguna así acá, pero la afirmación honesta es "conviene en promedio", no "conviene siempre".

## Lo que NO cambia

**El middleware sigue corriendo en el edge**, en São Paulo (`gru1`). Eso no se configura con `regions` y no lo toca este cambio. El arranque en frío de 1.1 s que medimos sigue igual.

## Lo que descarté antes de llegar acá

**Mover las funciones a São Paulo (`gru1`).** Fue mi primera propuesta y era mala por dos motivos:

1. `gru1` requiere plan **Pro** — bloqueado por dinero, igual que los backups.
2. **Y aunque se pudiera, habría empeorado las cosas.** Habría cambiado *un* salto de usuario por *varios* saltos de query cruzando el continente entero.

El error de razonamiento fue mío: medí 623 ms con un `curl` desde una MacBook en Argentina y lo atribuí al camino del servidor. Esa era latencia personal, no la que paga la aplicación. Las funciones hablan con Supabase servidor a servidor.

## Verificación posterior al deploy

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "$i: %{http_code} en %{time_total}s\n" \
    https://turnos.walterbenegas.com.ar/dashboard
  sleep 3
done
```

⚠️ **Esa medición NO sirve para evaluar este cambio.** `/dashboard` sin sesión devuelve 307 desde el middleware y **nunca llega a la función ni a la base**. Mide el edge, que no cambió.

Para medir esto de verdad hay que **navegar con sesión iniciada** y comparar cuánto tarda en cargar la agenda o el listado de pacientes, antes y después. A ojo alcanza si la diferencia es real: son cientos de milisegundos.

La confirmación objetiva está en el log de Vercel de cualquier función: el campo de región debe decir **`pdx1`** en lugar de `iad1`.

## Rollback

Quitar la línea `"regions"` de `vercel.json` y desplegar. Vuelve al default (`iad1`). Sin migración, sin datos, sin riesgo.

## Estado

**Escrito, no desplegado.** Requiere `git push`.
