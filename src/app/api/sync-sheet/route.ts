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
    const oldRecord = body.old_record ?? null;
    const type = body.type ?? "INSERT";

    const { nombre, apellido, email, telefono, servicio, fecha, hora, notas, estado } = record;

    const sheets = google.sheets({ version: "v4", auth });

    if (type === "UPDATE" && oldRecord) {
      // Buscar la fila existente por email + fecha + hora y actualizar el estado
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Turnos!A:I",
      });

      const rows = res.data.values || [];
      const rowIndex = rows.findIndex(
        (row) => row[2] === email && row[5] === fecha && row[6] === hora
      );

      if (rowIndex > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: `Turnos!H${rowIndex + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[estado ?? "pendiente"]],
          },
        });
        return NextResponse.json({ ok: true, action: "updated" });
      }
    }

    // INSERT o no encontró la fila — agrega nueva
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

    return NextResponse.json({ ok: true, action: "inserted" });
  } catch (error) {
    console.error("sync-sheet error:", error);
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 });
  }
}
