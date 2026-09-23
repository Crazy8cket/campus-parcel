import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createApp } from './app.mjs';
import { JsonStore } from './store.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const { values } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '8787' },
    data: { type: 'string', default: join(__dirname, '../data/state.json') }
  }
});

const port = Number(values.port);
const store = new JsonStore(values.data);
await store.load();
const server = createApp(store);

server.listen(port, values.host, () => {
  console.log(`campus parcel sync: http://${values.host}:${port}`);
  console.log(`preview: http://${values.host}:${port}/preview/`);
});

