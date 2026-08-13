// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// Las opciones viven en src/lib/sentry-config.ts, compartidas con el runtime
// edge y con el cliente. Ahí está explicado por qué `sendDefaultPii` es false,
// por qué el sampling bajó a 0.1 en producción y qué sanea cada hook.

import * as Sentry from "@sentry/nextjs";
import { opcionesSentry } from "./src/lib/sentry-config";

Sentry.init(opcionesSentry);
