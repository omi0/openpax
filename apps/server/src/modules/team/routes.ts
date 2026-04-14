import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  invitationDtoSchema,
  inviteMemberInputSchema,
  publicInvitationDtoSchema,
  teamDtoSchema,
  teamMemberDtoSchema,
  updateMemberRoleInputSchema,
} from "@openpax/shared";
import { requireRestaurant, requireSession } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tags = ["Team"];
const invitationParam = restaurantIdParam.extend({ invitationId: z.uuid() });
const memberParam = restaurantIdParam.extend({ memberId: z.uuid() });
const publicInvitationParam = z.object({ invitationId: z.uuid() });

export function teamRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/team",
      tags,
      summary: "Members of the restaurant's organization and pending invitations",
      middleware: [requireRestaurant(ctx, { restaurant: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(teamDtoSchema, "Team") },
    }),
    async (c) => c.json(await svc.getTeam(ctx, c.get("restaurant")), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/team/invitations",
      tags,
      summary: "Invite someone by email",
      middleware: [requireRestaurant(ctx, { invitation: ["create"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(inviteMemberInputSchema) },
      responses: { 201: jsonResponse(invitationDtoSchema, "Pending invitation") },
    }),
    async (c) =>
      c.json(
        await svc.inviteMember(
          ctx,
          c.get("restaurant"),
          c.req.valid("json"),
          c.get("actor"),
          c.req.raw.headers,
        ),
        201,
      ),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/restaurants/{restaurantId}/team/invitations/{invitationId}",
      tags,
      middleware: [requireRestaurant(ctx, { invitation: ["cancel"] })] as const,
      request: { params: invitationParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.cancelInvitation(
        ctx,
        c.get("restaurant"),
        c.req.valid("param").invitationId,
        c.get("actor"),
        c.req.raw.headers,
      );
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/v1/restaurants/{restaurantId}/team/members/{memberId}",
      tags,
      summary: "Change a member's role",
      middleware: [requireRestaurant(ctx, { member: ["update"] })] as const,
      request: { params: memberParam, body: jsonBody(updateMemberRoleInputSchema) },
      responses: { 200: jsonResponse(teamMemberDtoSchema, "Updated member") },
    }),
    async (c) =>
      c.json(
        await svc.updateMemberRole(
          ctx,
          c.get("restaurant"),
          c.req.valid("param").memberId,
          c.req.valid("json").role,
          c.get("actor"),
          c.req.raw.headers,
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/restaurants/{restaurantId}/team/members/{memberId}",
      tags,
      middleware: [requireRestaurant(ctx, { member: ["delete"] })] as const,
      request: { params: memberParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.removeMember(
        ctx,
        c.get("restaurant"),
        c.req.valid("param").memberId,
        c.get("actor"),
        c.req.raw.headers,
      );
      return c.body(null, 204);
    },
  );

  // ----- invitee side
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/invitations/{invitationId}",
      tags,
      summary: "Preview an invitation from its link (no session needed)",
      request: { params: publicInvitationParam },
      responses: { 200: jsonResponse(publicInvitationDtoSchema, "Invitation") },
    }),
    async (c) => c.json(await svc.getPublicInvitation(ctx, c.req.valid("param").invitationId), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/invitations/{invitationId}/accept",
      tags,
      summary: "Accept an invitation as the signed-in user",
      middleware: [requireSession()] as const,
      request: { params: publicInvitationParam },
      responses: {
        200: jsonResponse(z.object({ organizationId: z.string() }), "Joined organization"),
      },
    }),
    async (c) =>
      c.json(
        await svc.acceptInvitation(ctx, c.req.valid("param").invitationId, c.req.raw.headers),
        200,
      ),
  );
}
