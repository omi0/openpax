import { restaurant } from "@sitli/db";
import { eq } from "drizzle-orm";
import type { AppContext, RestaurantRow } from "../context.js";
import { ApiError } from "./errors.js";

export async function findRestaurantBySlug(ctx: AppContext, slug: string): Promise<RestaurantRow> {
  const [row] = await ctx.db.select().from(restaurant).where(eq(restaurant.slug, slug)).limit(1);
  if (!row) throw ApiError.notFound("Restaurant");
  return row;
}

export async function findRestaurantById(ctx: AppContext, id: string): Promise<RestaurantRow> {
  const [row] = await ctx.db.select().from(restaurant).where(eq(restaurant.id, id)).limit(1);
  if (!row) throw ApiError.notFound("Restaurant");
  return row;
}
