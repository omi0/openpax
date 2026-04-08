import { defineModule } from "../module.js";
import { customerRoutes } from "./routes.js";

export const customersModule = defineModule({
  name: "customers",
  routes: customerRoutes,
});

/** Public API for features that read or annotate the guest book (assistants). */
export { getCustomer, listCustomers, toCustomerDto, updateCustomer } from "./service.js";
