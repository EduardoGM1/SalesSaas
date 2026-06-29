import fs from 'fs';
import path from 'path';
const root = path.resolve(new URL(import.meta.url).pathname, '..', '..', 'apps', 'web', 'dist');
console.log('root:', root);
const idx = path.join(root, 'index.html');
console.log('index path:', idx);
console.log('exists:', fs.existsSync(idx));
console.log('dir listing:', fs.readdirSync(root));
