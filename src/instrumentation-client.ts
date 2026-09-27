import { initBotId } from "botid/client/core";

// Invisible bot check on the pages whose server actions handle credentials.
// Only on Vercel: the challenge is served by Vercel's edge, so it can't load locally.
if (process.env.NEXT_PUBLIC_VERCEL_ENV) {
  initBotId({
    protect: [
      { path: "/login", method: "POST" },
      { path: "/register", method: "POST" },
    ],
  });
}
