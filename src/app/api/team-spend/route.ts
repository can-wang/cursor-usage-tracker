import { NextResponse } from "next/server";
import { getTeamDailySpend } from "@/lib/data";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getTeamDailySpend());
}
