import { NextResponse } from "next/server";
import {
  getGroupsWithMembers,
  renameBillingGroup,
  createBillingGroup,
  assignMemberToGroup,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export function GET() {
  const groups = getGroupsWithMembers();
  return NextResponse.json(groups);
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    action: string;
    groupId?: string;
    name?: string;
    email?: string;
    targetGroupId?: string;
  };

  if (body.action === "rename" && body.groupId && body.name) {
    renameBillingGroup(body.groupId, body.name);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "create" && body.name) {
    const id = createBillingGroup(body.name);
    return NextResponse.json({ ok: true, id });
  }

  if (body.action === "assign" && body.email && body.targetGroupId) {
    assignMemberToGroup(body.email, body.targetGroupId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
