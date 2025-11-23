import { render } from "preact";
import { App, type Route } from "./app.js";
import { startResizeReporting } from "./resize.js";
import "./styles.css";

function parseRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  // /book/:slug or /book/:slug/manage/:token ; in Vite dev: /widget/?slug=...
  const match = window.location.pathname.match(/\/book\/([^/]+)(?:\/manage\/([^/]+))?/);
  const slug = match?.[1] ?? params.get("slug") ?? "";
  const token = match?.[2] ?? params.get("token");
  const embedded = params.get("embed") === "1";
  return { slug: decodeURIComponent(slug), token: token ? decodeURIComponent(token) : null, embedded, instanceId: params.get("id"), lang: params.get("lang") };
}

const route = parseRoute();
if (route.embedded) document.body.classList.add("embedded");
startResizeReporting(route.instanceId);
const root = document.getElementById("app");
if (root) render(<App route={route} />, root);
