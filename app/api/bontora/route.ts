import { connection } from "next/server";
import { applyFrame, getState, resetState, type FramePayload } from "@/lib/state";

export async function GET() {
  // Uten dette blir svaret forhåndsrendret ved build (cacheComponents),
  // og overlayet ville vist samme gamle data for alltid.
  await connection();
  return Response.json(getState());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as FramePayload | null;
  if (!body || !Array.isArray(body.eliminations) || !body.raw) {
    return Response.json({ error: "Ugyldig data fra auto-eyes." }, { status: 400 });
  }
  return Response.json(applyFrame(body));
}

export async function DELETE() {
  return Response.json(resetState());
}
