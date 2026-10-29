import { connection } from "next/server";
import { applyFrame, editPlayer, getState, resetAll, type FramePayload } from "@/lib/state";

export async function GET() {
  // Uten dette blir svaret forhåndsrendret ved build (cacheComponents),
  // og overlayet ville vist samme gamle data for alltid.
  await connection();
  return Response.json(getState());
}

/** Nytt bilde fra auto-eyes. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as FramePayload | null;
  if (!body || !Array.isArray(body.eliminations) || !body.raw) {
    return Response.json({ error: "Ugyldig data fra auto-eyes." }, { status: 400 });
  }
  return Response.json(applyFrame(body));
}

/** Manuell retting: { name, kills?: number, placement?: number | null } */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const int = (v: unknown, min: number, max: number) =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

  if (
    !body ||
    !name ||
    name.length > 64 ||
    (body.kills !== undefined && !int(body.kills, 0, 99)) ||
    (body.placement !== undefined && body.placement !== null && !int(body.placement, 1, 100))
  ) {
    return Response.json(
      { error: "Trenger navn. kills må være 0–99 og placement 1–100 eller null." },
      { status: 400 }
    );
  }
  return Response.json(
    editPlayer(name, {
      kills: body.kills as number | undefined,
      placement: body.placement as number | null | undefined,
    })
  );
}

/** Nullstiller hele turneringen. */
export async function DELETE() {
  return Response.json(resetAll());
}
