import { disqualify, undoDisqualify } from "@/lib/state";

async function readName(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  return name.length > 0 && name.length <= 64 ? name : null;
}

const invalid = () => Response.json({ error: "Mangler navn." }, { status: 400 });

/** Diskvalifiserer en spiller: { name } */
export async function POST(request: Request) {
  const name = await readName(request);
  return name ? Response.json(disqualify(name)) : invalid();
}

/** Angrer en diskvalifisering: { name } */
export async function DELETE(request: Request) {
  const name = await readName(request);
  return name ? Response.json(undoDisqualify(name)) : invalid();
}
