"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const port = Number(process.env.PORT ?? 3000);
    app.use((_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
        next();
    });
    await app.listen(port, '127.0.0.1');
    console.log(`Dalat carousel tool ready: http://127.0.0.1:${port}/`);
}
if (require.main === module) {
    bootstrap().catch((error) => {
        console.error('Failed to start Nest application.', error);
        process.exitCode = 1;
    });
}
