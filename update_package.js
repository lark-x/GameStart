const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('apps/web/package.json', 'utf8'));
pkg.scripts['dev:shell'] = pkg.scripts['dev'];
pkg.scripts['dev'] = pkg.scripts['dev:vite'];
delete pkg.scripts['dev:vite'];
fs.writeFileSync('apps/web/package.json', JSON.stringify(pkg, null, 2) + '\n');
