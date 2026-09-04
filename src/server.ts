import { storageFromEnv } from "./storage/index.ts";
import { createApp } from "./app.ts";

const storage = storageFromEnv();
await storage.init();
const app = createApp(storage);
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`geardesk (${storage.kind}) listening on :${port}`);
});
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    server.close();
    await storage.close();
    process.exit(0);
  });
}
