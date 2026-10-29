import { z } from "zod";
import { idSchema, instantSchema } from "./common.js";

export const TABLE_SHAPES = ["rect", "round"] as const;
export const tableShapeSchema = z.enum(TABLE_SHAPES);

export const upsertTableInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    areaId: idSchema.nullable().default(null),
    minCovers: z.number().int().min(1).max(100).default(1),
    maxCovers: z.number().int().min(1).max(100),
    shape: tableShapeSchema.default("rect"),
    x: z.number().min(0).max(100).default(0),
    y: z.number().min(0).max(100).default(0),
    width: z.number().min(2).max(100).default(10),
    height: z.number().min(2).max(100).default(10),
    joinable: z.boolean().default(true),
    /** Tables it can be pushed against (same room). */
    joinWith: z.array(idSchema).max(30).default([]),
    /** Extra guests at the head when alone or at the end of a joined row. */
    headSeats: z.number().int().min(0).max(4).default(0),
    active: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .refine((t) => t.minCovers <= t.maxCovers, {
    message: "minCovers must not exceed maxCovers",
    path: ["minCovers"],
  });
export type UpsertTableInput = z.infer<typeof upsertTableInputSchema>;

export const tableDtoSchema = z.object({
  id: idSchema,
  restaurantId: idSchema,
  areaId: idSchema.nullable(),
  name: z.string(),
  minCovers: z.number().int(),
  maxCovers: z.number().int(),
  shape: tableShapeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  joinable: z.boolean(),
  joinWith: z.array(idSchema),
  headSeats: z.number().int(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type TableDto = z.infer<typeof tableDtoSchema>;

/** Drag-and-drop on the floor plan saves every moved table at once. */
export const updateTablePositionsInputSchema = z.object({
  positions: z
    .array(
      z.object({
        id: idSchema,
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().min(2).max(100).optional(),
        height: z.number().min(2).max(100).optional(),
      }),
    )
    .max(500),
});
export type UpdateTablePositionsInput = z.infer<typeof updateTablePositionsInputSchema>;

/** Staff pick the tables of a booking by hand; empty = unassign. */
export const assignTablesInputSchema = z.object({
  tableIds: z.array(idSchema).max(12),
  /** Seat the party even if a chosen table is taken at that time. */
  force: z.boolean().default(false),
});
export type AssignTablesInput = z.infer<typeof assignTablesInputSchema>;

export const bookingTableDtoSchema = z.object({ id: idSchema, name: z.string() });
export type BookingTableDto = z.infer<typeof bookingTableDtoSchema>;
