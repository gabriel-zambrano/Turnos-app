export const dynamic = 'force-dynamic'

import { google } from "googleapis";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// supabase se crea dentro de cada handler

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const body = await req.json();
    const record = body.record ?? body;
    const type = body.type ?? "INSERT";

    const { data: paciente } = await supabase
      .from("pacientes")
      .select("nombre, telefono, email")
      .eq("id", record.paciente_id)
      .single();

    const nombre = paciente?.nombre ?? "Sin nombre";
    const email = paciente?.email ?? "";
    const telefono = paciente?.telefono ?? "";

    const dt = new Date(record.fecha_hora);
    const ar = new Date(dt.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fecha = ar.toLocaleDateString("es-AR");
    const hora = String(ar.getHours()).padStart(2, "0") + ":" + String(ar.getMinutes()).padStart(2, "0");

    const sheets = google.sheets({ version: "v4", auth });

    if (type === "UPDATE") {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Turnos!A:I",
      });

      const rows = res.data.values || [];
      const rowIndex = rows.findIndex((row) => row[8] === record.id);

      if (rowIndex > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: `Turnos!G${rowIndex + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[record.estado ?? "pendiente"]] },
        });
        return NextResponse.json({ ok: true, action: "updated" });
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Turnos!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          nombre,
          email,
          telefono,
          record.tipo_tratamiento ?? "",
          fecha,
          hora,
          record.estado ?? "pendiente",
          record.notas ?? "",
          record.id,
        ]],
      },
    });

    return NextResponse.json({ ok: true, action: "inserted" });
  } catch (error) {
    console.error("sync-sheet error:", error);
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 });
  }
}
