import { z } from "zod";
import { emailSchema, instantSchema, memberRoleSchema } from "./common.js";

export const teamMemberDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  createdAt: instantSchema,
});
export type TeamMemberDto = z.infer<typeof teamMemberDtoSchema>;

export const invitationDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  status: z.string(),
  expiresAt: instantSchema,
  inviterName: z.string().nullable(),
});
export type InvitationDto = z.infer<typeof invitationDtoSchema>;

export const teamDtoSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  members: z.array(teamMemberDtoSchema),
  invitations: z.array(invitationDtoSchema),
});
export type TeamDto = z.infer<typeof teamDtoSchema>;

export const inviteMemberInputSchema = z.object({
  email: emailSchema,
  role: memberRoleSchema.default("staff"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

export const updateMemberRoleInputSchema = z.object({ role: memberRoleSchema });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;

/** What an invitee sees before signing up or logging in. */
export const publicInvitationDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  status: z.string(),
  expiresAt: instantSchema,
  organizationName: z.string(),
  inviterName: z.string().nullable(),
});
export type PublicInvitationDto = z.infer<typeof publicInvitationDtoSchema>;
