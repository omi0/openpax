import { z } from "zod";
import { idSchema, instantSchema, localDateSchema } from "./common.js";

/** Every planning meeting lasts one slot. */
export const MEETING_MINUTES = 30;

export const meetingSlotDtoSchema = z.object({
  startsAt: instantSchema,
  /** HH:MM in the restaurant timezone. */
  startLocal: z.string(),
  available: z.boolean(),
});
export type MeetingSlotDto = z.infer<typeof meetingSlotDtoSchema>;

export const meetingSlotsDtoSchema = z.object({
  date: localDateSchema,
  /** The restaurant is closed that day (closure), so no slot is offered. */
  closed: z.boolean(),
  slots: z.array(meetingSlotDtoSchema),
});
export type MeetingSlotsDto = z.infer<typeof meetingSlotsDtoSchema>;

export const meetingSlotsQuerySchema = z.object({ date: localDateSchema });

export const meetingDtoSchema = z.object({
  id: idSchema,
  bookingId: idSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  createdAt: instantSchema,
});
export type MeetingDto = z.infer<typeof meetingDtoSchema>;

/** A meeting with the booking it is about, for the upcoming-meetings list. */
export const meetingListItemDtoSchema = meetingDtoSchema.extend({
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  partySize: z.number().int(),
  bookingStartsAt: instantSchema,
  bookingStatus: z.string(),
});
export type MeetingListItemDto = z.infer<typeof meetingListItemDtoSchema>;

export const listMeetingsQuerySchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
});

export const scheduleMeetingInputSchema = z.object({ startsAt: instantSchema });
export type ScheduleMeetingInput = z.infer<typeof scheduleMeetingInputSchema>;
