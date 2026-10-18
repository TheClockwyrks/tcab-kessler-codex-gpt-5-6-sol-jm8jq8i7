# Kessler

Kessler is a browser-based orbital demolition arcade game. Circle a warm planet with a steerable deflector, launch demolition balls through three moving debris rings, and catch salvage pods before they burn up. Waves accelerate without limit and a missed final ball ends the run.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. Build the self-contained static site with `npm run build`; the finished site is written to `dist/` and can be served from a host root or sub-path. Run checks with `npm run typecheck`, `npm run lint`, `npm run format`, and `npm test`.

## Controls

- Rotate: `A`/`D` or left/right arrows
- Launch or confirm: `Space`; menu confirm also accepts `Enter`
- Menu selection: `W`/`S` or up/down arrows
- Pause/resume: `P` or `Escape`
- Debug overlay: backtick

Title and pause menus also support mouse, pen, and touch.
