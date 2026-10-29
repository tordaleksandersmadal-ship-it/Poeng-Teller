import { finishMatch } from "@/lib/state";

/** Lagrer kampen i historikken og starter en ny. */
export async function POST() {
  return Response.json(finishMatch());
}
