// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// Las opciones viven en src/lib/sentry-config.ts, compartidas con el servidor
// y con el runtime edge.
//
// El cliente es el que más importa para el portal del paciente: el navegador
// carga /paciente/<token>, genera una transacción de pageload con esa URL y
// después hace fetch a /api/paciente/<token>, que deja el token en un
// breadcrumb y en un span. Los tres pasan por el saneo.

import * as Sentry from "@sentry/nextjs";
import { opcionesSentry } from "./lib/sentry-config";

Sentry.init(opcionesSentry);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
