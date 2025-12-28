import { invitation, member, organization, user } from "@sitli/db";
import type {
  InvitationDto,
  InviteMemberInput,
  MemberRole,
  PublicInvitationDto,
  TeamDto,
  TeamMemberDto,
} from "@sitli/shared";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { roles } from "../../auth/access.js";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { callAuth } from "../../lib/auth-call.js";
import { ApiError } from "../../lib/errors.js";

const asRole = (v: string | null | undefined): MemberRole =>
  v && v in roles ? (v as MemberRole) : "staff";

function requireUser(actor: Actor): Extract<Actor, { type: "user" }> {
  if (actor.type !== "user")
    throw ApiError.forbidden("Team management needs a signed-in user, not an API key");
  return actor;
}

export async function getTeam(ctx: AppContext, r: RestaurantRow): Promise<TeamDto> {
  const [org] = await ctx.db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, r.organizationId))
    .limit(1);
  if (!org) throw ApiError.notFound("Organization");
  const members = await ctx.db
    .select({ member, user })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, r.organizationId))
    .orderBy(asc(member.createdAt));
  const invitations = await ctx.db
    .select({ invitation, inviterName: user.name })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.organizationId, r.organizationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, ctx.now()),
      ),
    )
    .orderBy(desc(invitation.createdAt));
  return {
    organizationId: org.id,
    organizationName: org.name,
    members: members.map(
      (m): TeamMemberDto => ({
        id: m.member.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: asRole(m.member.role),
        createdAt: m.member.createdAt.toISOString(),
      }),
    ),
    invitations: invitations.map(
      (i): InvitationDto => ({
        id: i.invitation.id,
        email: i.invitation.email,
        role: asRole(i.invitation.role),
        status: i.invitation.status,
        expiresAt: i.invitation.expiresAt.toISOString(),
        inviterName: i.inviterName,
      }),
    ),
  };
}

export async function inviteMember(
  ctx: AppContext,
  r: RestaurantRow,
  input: InviteMemberInput,
  actor: Actor,
  headers: Headers,
): Promise<InvitationDto> {
  const u = requireUser(actor);
  if (input.role === "owner" && u.role !== "owner")
    throw ApiError.forbidden("Only owners can invite other owners");
  const email = input.email.trim().toLowerCase();
  const [existing] = await ctx.db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, r.organizationId), eq(user.email, email)))
    .limit(1);
  if (existing) throw ApiError.conflict("already_member", "This person is already on the team");

  const created = await callAuth(() =>
    ctx.auth.api.createInvitation({
      body: { email, role: input.role, organizationId: r.organizationId, resend: true },
      headers,
    }),
  );
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    organizationId: r.organizationId,
    actor,
    action: "team.invited",
    entityType: "invitation",
    entityId: created.id,
    data: { email, role: input.role },
  });
  const [inviter] = await ctx.db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, created.inviterId))
    .limit(1);
  return {
    id: created.id,
    email: created.email,
    role: asRole(created.role),
    status: created.status,
    expiresAt: new Date(created.expiresAt).toISOString(),
    inviterName: inviter?.name ?? null,
  };
}

export async function cancelInvitation(
  ctx: AppContext,
  r: RestaurantRow,
  invitationId: string,
  actor: Actor,
  headers: Headers,
): Promise<void> {
  requireUser(actor);
  const [row] = await ctx.db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, r.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Invitation");
  await callAuth(() => ctx.auth.api.cancelInvitation({ body: { invitationId }, headers }));
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    organizationId: r.organizationId,
    actor,
    action: "team.invitation_cancelled",
    entityType: "invitation",
    entityId: invitationId,
  });
}

async function findMember(ctx: AppContext, r: RestaurantRow, memberId: string) {
  const [row] = await ctx.db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, r.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Member");
  return row;
}

export async function updateMemberRole(
  ctx: AppContext,
  r: RestaurantRow,
  memberId: string,
  role: MemberRole,
  actor: Actor,
  headers: Headers,
): Promise<TeamMemberDto> {
  const u = requireUser(actor);
  const target = await findMember(ctx, r, memberId);
  if (target.userId === u.id) throw ApiError.forbidden("You cannot change your own role");
  if ((role === "owner" || target.role === "owner") && u.role !== "owner")
    throw ApiError.forbidden("Only owners can change owner roles");
  await callAuth(() =>
    ctx.auth.api.updateMemberRole({
      body: { memberId, role, organizationId: r.organizationId },
      headers,
    }),
  );
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    organizationId: r.organizationId,
    actor,
    action: "team.role_changed",
    entityType: "member",
    entityId: memberId,
    data: { from: target.role, to: role },
  });
  const [row] = await ctx.db
    .select({ member, user })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.id, memberId))
    .limit(1);
  if (!row) throw ApiError.notFound("Member");
  return {
    id: row.member.id,
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    role: asRole(row.member.role),
    createdAt: row.member.createdAt.toISOString(),
  };
}

export async function removeMember(
  ctx: AppContext,
  r: RestaurantRow,
  memberId: string,
  actor: Actor,
  headers: Headers,
): Promise<void> {
  const u = requireUser(actor);
  const target = await findMember(ctx, r, memberId);
  if (target.userId === u.id) throw ApiError.forbidden("You cannot remove yourself");
  if (target.role === "owner" && u.role !== "owner")
    throw ApiError.forbidden("Only owners can remove owners");
  await callAuth(() =>
    ctx.auth.api.removeMember({
      body: { memberIdOrEmail: memberId, organizationId: r.organizationId },
      headers,
    }),
  );
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    organizationId: r.organizationId,
    actor,
    action: "team.member_removed",
    entityType: "member",
    entityId: memberId,
    data: { userId: target.userId, role: target.role },
  });
}

export async function getPublicInvitation(
  ctx: AppContext,
  invitationId: string,
): Promise<PublicInvitationDto> {
  const [row] = await ctx.db
    .select({ invitation, organizationName: organization.name, inviterName: user.name })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!row) throw ApiError.notFound("Invitation");
  const expired = row.invitation.expiresAt.getTime() <= ctx.now().getTime();
  return {
    id: row.invitation.id,
    email: row.invitation.email,
    role: asRole(row.invitation.role),
    status: expired && row.invitation.status === "pending" ? "expired" : row.invitation.status,
    expiresAt: row.invitation.expiresAt.toISOString(),
    organizationName: row.organizationName,
    inviterName: row.inviterName,
  };
}

export async function acceptInvitation(
  ctx: AppContext,
  invitationId: string,
  headers: Headers,
): Promise<{ organizationId: string }> {
  const result = await callAuth(() =>
    ctx.auth.api.acceptInvitation({ body: { invitationId }, headers }),
  );
  if (!result) throw ApiError.notFound("Invitation");
  return { organizationId: result.invitation.organizationId };
}
