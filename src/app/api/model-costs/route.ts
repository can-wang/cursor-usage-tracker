import { NextResponse } from "next/server";
import { getModelCostBreakdown } from "@/lib/data";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getModelCostBreakdown());
}
