/** Tell the embedding page how tall the widget is so the iframe can grow with it. */
export function startResizeReporting(instanceId: string | null) {
  if (window.parent === window) return;
  const post = () => {
    const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    window.parent.postMessage({ type: "sitli:resize", id: instanceId, height }, "*");
  };
  const observer = new ResizeObserver(post);
  observer.observe(document.documentElement);
  observer.observe(document.body);
  window.addEventListener("load", post);
  post();
}

export function scrollParentToTop(instanceId: string | null) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "sitli:scroll-top", id: instanceId }, "*");
}
