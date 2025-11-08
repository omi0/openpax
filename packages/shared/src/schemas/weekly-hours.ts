import type { TimeWindow, WeeklyHours } from "@sitli/core";
import { WEEKDAYS } from "@sitli/core";
import { z } from "zod";
import { localTimeSchema } from "./common.js";

export const timeWindowSchema: z.ZodType<TimeWindow> = z.object({
  start: localTimeSchema,
  end: localTimeSchema,
});

export const weekdaySchema = z.enum(WEEKDAYS);

export const weeklyHoursSchema: z.ZodType<WeeklyHours> = z
  .object({
    mon: z.array(timeWindowSchema).max(6),
    tue: z.array(timeWindowSchema).max(6),
    wed: z.array(timeWindowSchema).max(6),
    thu: z.array(timeWindowSchema).max(6),
    fri: z.array(timeWindowSchema).max(6),
    sat: z.array(timeWindowSchema).max(6),
    sun: z.array(timeWindowSchema).max(6),
  })
  .partial();
