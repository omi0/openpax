/**
 * Sitli embed loader. Usage on any website:
 *   <div id="sitli-booking"></div>
 *   <script src="https://bookings.example.com/embed.js" data-restaurant="my-slug" data-target="#sitli-booking" async></script>
 * Optional: data-lang="en", data-min-height="520".
 */
(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;
  const restaurant = script.dataset.restaurant;
  if (!restaurant) {
    console.error("[sitli] data-restaurant is required");
    return;
  }
  const origin = new URL(script.src).origin;
  const id = `sitli-${Math.random().toString(36).slice(2, 10)}`;
  const target = (script.dataset.target && document.querySelector(script.dataset.target)) || script.parentElement || document.body;
  const params = new URLSearchParams({ embed: "1", id });
  if (script.dataset.lang) params.set("lang", script.dataset.lang);

  const iframe = document.createElement("iframe");
  iframe.src = `${origin}/book/${encodeURIComponent(restaurant)}?${params.toString()}`;
  iframe.title = "Booking";
  iframe.setAttribute("loading", "lazy");
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.minHeight = `${script.dataset.minHeight ?? "520"}px`;
  iframe.style.transition = "height 150ms ease";
  target.appendChild(iframe);

  window.addEventListener("message", (event) => {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return;
    const data = event.data as { type?: string; id?: string; height?: number };
    if (data?.id !== id) return;
    if (data.type === "sitli:resize" && typeof data.height === "number") {
      iframe.style.height = `${Math.max(data.height, 120)}px`;
      iframe.style.minHeight = "0";
    } else if (data.type === "sitli:scroll-top") {
      const top = iframe.getBoundingClientRect().top + window.scrollY - 16;
      if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
    }
  });
})();
