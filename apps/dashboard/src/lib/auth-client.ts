import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  // when an assistant sent the browser here, the signed OAuth query in the
  // page URL rides along with sign-in and consent calls
  plugins: [organizationClient(), oauthProviderClient()],
});
