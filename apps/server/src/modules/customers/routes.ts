import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  customerDtoSchema,
  customerTagDtoSchema,
  listCustomersQuerySchema,
  paginatedSchema,
  updateCustomerInputSchema,
} from "@sitli/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tags = ["Customers"];
const customerIdParam = restaurantIdParam.extend({ customerId: z.uuid() });

export function customerRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/customers",
      tags,
      summary: "Search the guest book",
      middleware: [requireRestaurant(ctx, { customer: ["read"] })] as const,
      request: { params: restaurantIdParam, query: listCustomersQuerySchema },
      responses: { 200: jsonResponse(paginatedSchema(customerDtoSchema), "Customers") },
    }),
    async (c) =>
      c.json(await svc.listCustomers(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/customers/tags",
      tags,
      summary: "Tags in use, most common first",
      middleware: [requireRestaurant(ctx, { customer: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(z.array(customerTagDtoSchema), "Tags") },
    }),
    async (c) => c.json(await svc.listTags(ctx, c.get("restaurant").id), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/customers/{customerId}",
      tags,
      middleware: [requireRestaurant(ctx, { customer: ["read"] })] as const,
      request: { params: customerIdParam },
      responses: { 200: jsonResponse(customerDtoSchema, "Customer") },
    }),
    async (c) =>
      c.json(
        svc.toCustomerDto(
          await svc.getCustomer(ctx, c.get("restaurant").id, c.req.valid("param").customerId),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/v1/restaurants/{restaurantId}/customers/{customerId}",
      tags,
      summary: "Edit contact details, notes, tags or consent",
      middleware: [requireRestaurant(ctx, { customer: ["update"] })] as const,
      request: { params: customerIdParam, body: jsonBody(updateCustomerInputSchema) },
      responses: { 200: jsonResponse(customerDtoSchema, "Updated customer") },
    }),
    async (c) =>
      c.json(
        svc.toCustomerDto(
          await svc.updateCustomer(
            ctx,
            c.get("restaurant"),
            c.req.valid("param").customerId,
            c.req.valid("json"),
            c.get("actor"),
          ),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/restaurants/{restaurantId}/customers/{customerId}",
      tags,
      summary: "Delete a customer (anonymised when bookings reference them)",
      middleware: [requireRestaurant(ctx, { customer: ["delete"] })] as const,
      request: { params: customerIdParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.deleteCustomer(
        ctx,
        c.get("restaurant"),
        c.req.valid("param").customerId,
        c.get("actor"),
      );
      return c.body(null, 204);
    },
  );
}
