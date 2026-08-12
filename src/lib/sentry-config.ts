// ─────────────────────────────────────────────────────────────
// Opciones compartidas de Sentry para los tres entornos.
//
// Antes cada uno (server, edge, cliente) repetía el mismo bloque copiado a
// mano. Tres copias del mismo valor divergen: alcanza con que alguien ajuste
// el sampling en uno y se olvide de los otros para que la protección quede
// desparejada. Acá hay una sola fuente.
// ─────────────────────────────────────────────────────────────

import { beforeSend, beforeBreadcrumb } from './sentry-scrub'

const EN_PRODUCCION = process.env.NODE_ENV === 'production'

export const SENTRY_DSN =
  'https://c32ad30fdc6aebeaa36490bc645231d7@o4511264226541568.ingest.us.sentry.io/4511264235913216'

export const opcionesSentry = {
  dsn: SENTRY_DSN,

  // Separa producción de los deploys de preview: un error de preview no debería
  // mezclarse con los de la clínica que está trabajando.
  //
  // `NEXT_PUBLIC_VERCEL_ENV` va primero y no es un capricho. Next solo expone al
  // navegador las variables con prefijo `NEXT_PUBLIC_`: sin ella, en el cliente
  // `VERCEL_ENV` es `undefined` y cae a `NODE_ENV`, que en cualquier build de
  // producción vale 'production'. Resultado: los eventos de preview llegaban
  // etiquetados como producción y se mezclaban con los reales.
  //
  // Verificado en el evento JAVASCRIPT-NEXTJS-G del 12/08/2026, generado desde
  // un preview y rotulado `environment: production`.
  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'development',

  // ── sendDefaultPii: false ──
  // Era `true`. Con eso el SDK adjuntaba IP, headers y cookies —incluida
  // `sb-<project-ref>-auth-token`, la sesión de Supabase— a cada evento.
  // Para un sistema con datos de salud eso no es aceptable, y no aporta al
  // diagnóstico: lo que sirve es el stack, no la IP.
  sendDefaultPii: false,

  // ── tracesSampleRate ──
  // Era `1` en producción: CADA request generaba un evento con su URL, y las
  // URLs de este sistema llevan el token en el path. Con 0.1 el muestreo sigue
  // sirviendo para ver tendencias de performance y reduce en un 90% la
  // superficie. En desarrollo se deja en 1 porque el volumen es irrelevante y
  // conviene ver todo.
  tracesSampleRate: EN_PRODUCCION ? 0.1 : 1,

  // ── enableLogs ──
  // Era `true`. El proyecto tiene 57 `console.*` que nadie escribió pensando
  // en que salieran a un tercero. Hasta revisarlos uno por uno, en producción
  // no se mandan. En desarrollo quedan habilitados.
  enableLogs: !EN_PRODUCCION,

  // ── Saneo ──
  // Los tres hooks son necesarios y se equivocan quienes ponen solo el primero:
  //   · beforeSend            → errores
  //   · beforeSendTransaction → trazas, que es DONDE ESTÁN las URLs
  //   · beforeBreadcrumb      → los breadcrumbs de fetch también las llevan
  beforeSend,
  beforeSendTransaction: beforeSend,
  beforeBreadcrumb,
}
