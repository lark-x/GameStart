const fs = require('fs');
let code = fs.readFileSync('apps/web/vite.config.ts', 'utf8');
code = code.replace(
  '          if (request.url === "/" || request.url === "/index.html") {\n            request.url = "/index-vue.html";\n          }',
  '          // 默认入口不再强行跳转'
);
fs.writeFileSync('apps/web/vite.config.ts', code);
