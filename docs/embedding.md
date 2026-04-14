# Embedding the widget

Copy the snippet from **Settings → Widget** in the dashboard. It looks like:

```html
<div id="openpax-booking"></div>
<script src="https://bookings.example.com/embed.js"
        data-restaurant="trattoria-roma"
        data-target="#openpax-booking" async></script>
```

The loader creates an iframe pointing at the hosted booking page and resizes
it as the guest moves through the steps. Because it is an iframe, your site's
CSS cannot break the widget and the widget cannot read anything on your page.

Options on the `<script>` tag:

| attribute | meaning |
|---|---|
| `data-restaurant` | the restaurant slug (required) |
| `data-target` | CSS selector of the element to render into (defaults to the script's parent) |
| `data-lang` | force the widget language (`it` or `en`); otherwise the restaurant default |
| `data-min-height` | initial iframe height in px before the first resize (default 520) |

## Hosted page

Every restaurant also has a standalone page at
`https://bookings.example.com/book/<slug>`: link it from Instagram, Google
Business Profile, or a QR code on the menu.

Guests manage or cancel a booking from the link in their confirmation email:
`/book/<slug>/manage/<token>`.

## WordPress, Wix, Squarespace

Paste the snippet into an HTML/embed block. On Wix and Squarespace, prefer the
hosted page link if the platform strips `<script>` tags on your plan.
