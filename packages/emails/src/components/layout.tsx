/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from "react";

export interface LayoutProps {
  title: string;
  preheader?: string;
  primaryColor: string;
  restaurantName: string;
  logoUrl?: string | null;
  footer: string;
  children: ReactNode;
}

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Table-based, inline-styled shell that renders consistently across mail clients. */
export function Layout(props: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <title>{props.title}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#f4f4f5", fontFamily: font }}>
        {props.preheader ? (
          <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>
            {props.preheader}
          </div>
        ) : null}
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 12px" }}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{ maxWidth: 560, backgroundColor: "#ffffff", borderRadius: 12 }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          backgroundColor: props.primaryColor,
                          borderRadius: "12px 12px 0 0",
                          padding: "20px 28px",
                          color: "#ffffff",
                          fontSize: 20,
                          fontWeight: 700,
                        }}
                      >
                        {props.logoUrl ? (
                          <img
                            src={props.logoUrl}
                            alt={props.restaurantName}
                            height={36}
                            style={{ display: "block", height: 36 }}
                          />
                        ) : (
                          props.restaurantName
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{ padding: "28px", color: "#18181b", fontSize: 16, lineHeight: 1.5 }}
                      >
                        {props.children}
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          padding: "16px 28px 24px",
                          color: "#71717a",
                          fontSize: 12,
                          lineHeight: 1.5,
                          borderTop: "1px solid #e4e4e7",
                        }}
                      >
                        {props.footer}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function Button({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "20px 0" }}>
      <tbody>
        <tr>
          <td style={{ backgroundColor: color, borderRadius: 8 }}>
            <a
              href={href}
              style={{
                display: "inline-block",
                padding: "12px 20px",
                color: "#ffffff",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {label}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Details({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: "16px 0", backgroundColor: "#fafafa", borderRadius: 8 }}
    >
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: "8px 14px", color: "#71717a", fontSize: 14, width: "40%" }}>
              {label}
            </td>
            <td style={{ padding: "8px 14px", fontWeight: 600, fontSize: 14 }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
