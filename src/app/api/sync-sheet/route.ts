import { google } from "googleapis";
import { NextResponse } from "next/server";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const record = body.record ?? body;

    const { nombre, apellido, email, telefono, servicio, fecha, hora, notas, estado } = record;

    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Turnos!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          nombre,
          apellido,
          email,
          telefono,
          servicio,
          fecha,
          hora,
          estado ?? "pendiente",
          notas ?? "",
        ]],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sync-sheet error:", error);
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 });
  }
}
