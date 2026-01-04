import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  areaDtoSchema,
  bookingPolicyDtoSchema,
  capacityRuleDtoSchema,
  createRestaurantInputSchema,
  restaurantDtoSchema,
  restaurantSummaryDtoSchema,
  scheduleExceptionDtoSchema,
  serviceDtoSchema,
  updateBookingPolicyInputSchema,
  updateRestaurantInputSchema,
  updateWidgetConfigInputSchema,
  upsertAreaInputSchema,
  upsertCapacityRuleInputSchema,
  upsertScheduleExceptionInputSchema,
  upsertServiceInputSchema,
  widgetConfigDtoSchema,
} from "@sitli/shared";
import { requireRestaurant, requireSession } from "../../auth/middleware.js";
import { isSignupOpen } from "../../auth/signup.js";
import type { AppContext, AppEnv } from "../../context.js";
import { ApiError } from "../../lib/errors.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tags = ["Restaurants"];
const idParam = restaurantIdParam.extend({ id: z.uuid() });

export function restaurantRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/auth-config",
      tags: ["Account"],
      summary: "Whether a visitor without an invitation can create an account",
      responses: {
        200: jsonResponse(
          z.object({
            signupMode: z.enum(["open", "invite_only", "first_user"]),
            signupOpen: z.boolean(),
          }),
          "Sign-up policy of this instance",
        ),
      },
    }),
    async (c) =>
      c.json(
        {
          signupMode: ctx.env.SIGNUP_MODE,
          signupOpen: await isSignupOpen(ctx.db, ctx.env.SIGNUP_MODE),
        },
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/me",
      tags: ["Account"],
      middleware: [requireSession()] as const,
      responses: {
        200: jsonResponse(
          z.object({
            user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
            restaurants: z.array(restaurantSummaryDtoSchema),
          }),
          "Current user and the restaurants they can access",
        ),
      },
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) throw ApiError.unauthorized();
      const restaurants = await svc.listRestaurantsForUser(ctx, user.id);
      return c.json(
        { user: { id: user.id, name: user.name, email: user.email }, restaurants },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants",
      tags,
      middleware: [requireSession()] as const,
      responses: {
        200: jsonResponse(z.array(restaurantSummaryDtoSchema), "Restaurants the caller belongs to"),
      },
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) throw ApiError.unauthorized();
      return c.json(await svc.listRestaurantsForUser(ctx, user.id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants",
      tags,
      middleware: [requireSession()] as const,
      request: { body: jsonBody(createRestaurantInputSchema) },
      responses: { 201: jsonResponse(restaurantDtoSchema, "Created restaurant") },
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) throw ApiError.unauthorized();
      const dto = await svc.createRestaurant(ctx, {
        userId: user.id,
        headers: c.req.raw.headers,
        input: c.req.valid("json"),
      });
      return c.json(dto, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}",
      tags,
      middleware: [requireRestaurant(ctx, { restaurant: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(restaurantDtoSchema, "Restaurant") },
    }),
    async (c) => c.json(svc.toRestaurantDto(c.get("restaurant")), 200),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/v1/restaurants/{restaurantId}",
      tags,
      middleware: [requireRestaurant(ctx, { restaurant: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(updateRestaurantInputSchema) },
      responses: { 200: jsonResponse(restaurantDtoSchema, "Updated restaurant") },
    }),
    async (c) =>
      c.json(
        await svc.updateRestaurant(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        200,
      ),
  );

  // ----- services
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/services",
      tags,
      middleware: [requireRestaurant(ctx, { service: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(z.array(serviceDtoSchema), "Services") },
    }),
    async (c) => c.json(await svc.listServices(ctx, c.get("restaurant").id), 200),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/services",
      tags,
      middleware: [requireRestaurant(ctx, { service: ["create"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(upsertServiceInputSchema) },
      responses: { 201: jsonResponse(serviceDtoSchema, "Created service") },
    }),
    async (c) =>
      c.json(
        await svc.createService(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        201,
      ),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: "/api/v1/restaurants/{restaurantId}/services/{id}",
      tags,
      middleware: [requireRestaurant(ctx, { service: ["update"] })] as const,
      request: { params: idParam, body: jsonBody(upsertServiceInputSchema) },
      responses: { 200: jsonResponse(serviceDtoSchema, "Updated service") },
    }),
    async (c) =>
      c.json(
        await svc.updateService(
          ctx,
          c.get("restaurant"),
          c.req.valid("param").id,
          c.req.valid("json"),
          c.get("actor"),
        ),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/restaurants/{restaurantId}/services/{id}",
      tags,
      middleware: [requireRestaurant(ctx, { service: ["delete"] })] as const,
      request: { params: idParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.deleteService(ctx, c.get("restaurant"), c.req.valid("param").id, c.get("actor"));
      return c.body(null, 204);
    },
  );

  // ----- policy
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/policy",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(bookingPolicyDtoSchema, "Booking policy") },
    }),
    async (c) => c.json(await svc.getPolicy(ctx, c.get("restaurant").id), 200),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: "/api/v1/restaurants/{restaurantId}/policy",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(updateBookingPolicyInputSchema) },
      responses: { 200: jsonResponse(bookingPolicyDtoSchema, "Updated policy") },
    }),
    async (c) =>
      c.json(
        await svc.updatePolicy(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        200,
      ),
  );

  // ----- widget config
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/widget-config",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: {
        200: jsonResponse(widgetConfigDtoSchema, "Widget configuration and embed code"),
      },
    }),
    async (c) => c.json(await svc.getWidgetConfig(ctx, c.get("restaurant")), 200),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: "/api/v1/restaurants/{restaurantId}/widget-config",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(updateWidgetConfigInputSchema) },
      responses: { 200: jsonResponse(widgetConfigDtoSchema, "Updated widget configuration") },
    }),
    async (c) =>
      c.json(
        await svc.updateWidgetConfig(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        200,
      ),
  );

  // ----- areas / exceptions / capacity rules
  const crud = <TDto extends z.ZodType, TInput extends z.ZodType>(
    segment: string,
    dto: TDto,
    input: TInput,
    ops: {
      list: (restaurantId: string) => Promise<z.infer<TDto>[]>;
      create: (
        r: AppEnv["Variables"]["restaurant"],
        body: z.infer<TInput>,
      ) => Promise<z.infer<TDto>>;
      update: (
        r: AppEnv["Variables"]["restaurant"],
        id: string,
        body: z.infer<TInput>,
      ) => Promise<z.infer<TDto>>;
      remove: (r: AppEnv["Variables"]["restaurant"], id: string) => Promise<void>;
    },
  ) => {
    const base = `/api/v1/restaurants/{restaurantId}/${segment}` as const;
    app.openapi(
      createRoute({
        method: "get",
        path: base,
        tags,
        middleware: [requireRestaurant(ctx, { service: ["read"] })] as const,
        request: { params: restaurantIdParam },
        responses: { 200: jsonResponse(z.array(dto), "List") },
      }),
      async (c) => c.json(await ops.list(c.get("restaurant").id), 200),
    );
    app.openapi(
      createRoute({
        method: "post",
        path: base,
        tags,
        middleware: [requireRestaurant(ctx, { service: ["create"] })] as const,
        request: { params: restaurantIdParam, body: jsonBody(input) },
        responses: { 201: jsonResponse(dto, "Created") },
      }),
      // validation ran in the route; inside this generic helper the accessor loses its literal typing
      async (c) =>
        c.json(
          await ops.create(c.get("restaurant"), c.req.valid("json" as never) as z.infer<TInput>),
          201,
        ),
    );
    app.openapi(
      createRoute({
        method: "put",
        path: `${base}/{id}`,
        tags,
        middleware: [requireRestaurant(ctx, { service: ["update"] })] as const,
        request: { params: idParam, body: jsonBody(input) },
        responses: { 200: jsonResponse(dto, "Updated") },
      }),
      async (c) =>
        c.json(
          await ops.update(
            c.get("restaurant"),
            c.req.param("id"),
            c.req.valid("json" as never) as z.infer<TInput>,
          ),
          200,
        ),
    );
    app.openapi(
      createRoute({
        method: "delete",
        path: `${base}/{id}`,
        tags,
        middleware: [requireRestaurant(ctx, { service: ["delete"] })] as const,
        request: { params: idParam },
        responses: { 204: noContentResponse },
      }),
      async (c) => {
        await ops.remove(c.get("restaurant"), c.req.param("id"));
        return c.body(null, 204);
      },
    );
  };

  crud("areas", areaDtoSchema, upsertAreaInputSchema, {
    list: (id) => svc.listAreas(ctx, id),
    create: (r, b) => svc.createArea(ctx, r, b),
    update: (r, id, b) => svc.updateArea(ctx, r, id, b),
    remove: (r, id) => svc.deleteArea(ctx, r, id),
  });
  crud("schedule-exceptions", scheduleExceptionDtoSchema, upsertScheduleExceptionInputSchema, {
    list: (id) => svc.listExceptions(ctx, id),
    create: (r, b) => svc.createException(ctx, r, b),
    update: (r, id, b) => svc.updateException(ctx, r, id, b),
    remove: (r, id) => svc.deleteException(ctx, r, id),
  });
  crud("capacity-rules", capacityRuleDtoSchema, upsertCapacityRuleInputSchema, {
    list: (id) => svc.listCapacityRules(ctx, id),
    create: (r, b) => svc.createCapacityRule(ctx, r, b),
    update: (r, id, b) => svc.updateCapacityRule(ctx, r, id, b),
    remove: (r, id) => svc.deleteCapacityRule(ctx, r, id),
  });
}
