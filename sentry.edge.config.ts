// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// Las opciones viven en src/lib/sentry-config.ts, compartidas con el servidor
// y con el cliente.
//
// Este runtime importa porque el middleware corre acá, y el middleware ve
// TODAS las rutas —incluidas /paciente/<token> y /firmar/<token>—.

import * as Sentry from "@sentry/nextjs";
import { opcionesSentry } from "./src/lib/sentry-config";

Sentry.init(opcionesSentry);
