// Build an isolated, matching backend/frontend review artifact. Does not replace live build.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), backend = path.join(root, 'backend'), frontend = path.join(root, 'frontend');
const output = path.join(root, 'outputs/cache-policy-build');
const esbuild = require('../backend/node_modules/esbuild');
async function main() {
  const backendVersion = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'))).version;
  const frontendVersion = JSON.parse(fs.readFileSync(path.join(frontend, 'package.json'))).version;
  if (backendVersion !== frontendVersion) throw Error('Version mismatch');
  fs.mkdirSync(path.join(output, 'backend'), { recursive: true });
  execFileSync(process.execPath, [path.join(backend, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--outDir', path.join(output, 'backend/dist')], { cwd: backend, stdio: 'inherit' });
  await esbuild.build({ entryPoints: [path.join(output, 'backend/dist/main.js')], bundle: true, platform: 'node', format: 'cjs', target: 'node24', nodePaths: [path.join(backend, 'node_modules')], external: ['sharp', '@nestjs/microservices', '@nestjs/microservices/*', '@nestjs/websockets', '@nestjs/websockets/*', 'class-validator', 'class-transformer'], outfile: path.join(output, 'backend/dalat_tiktok_carousel_tool_standalone.cjs') });
  for (const name of ['backend', 'frontend']) for (const file of ['package.json', 'package-lock.json']) {
    fs.mkdirSync(path.join(output, name), { recursive: true });
    fs.copyFileSync(path.join(root, name, file), path.join(output, name, file));
  }
  for (const name of ['sharp', '@img', 'detect-libc', 'semver']) {
    fs.cpSync(path.join(backend, 'node_modules', name), path.join(output, 'backend/node_modules', name), { recursive: true });
  }
  fs.cpSync(path.join(frontend, '.next'), path.join(output, 'frontend/.next'), { recursive: true, filter: source => !source.startsWith(path.join(frontend, '.next/cache')) });
  fs.cpSync(path.join(frontend, 'public'), path.join(output, 'frontend/public'), { recursive: true });
  fs.copyFileSync(path.join(frontend, 'next.config.js'), path.join(output, 'frontend/next.config.js'));
  const bundle = path.join(output, 'backend/dalat_tiktok_carousel_tool_standalone.cjs');
  fs.writeFileSync(path.join(output, 'build-manifest.json'), JSON.stringify({ version: backendVersion, builtAt: new Date().toISOString(), backendSha256: crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'), frontendBuildId: fs.readFileSync(path.join(output, 'frontend/.next/BUILD_ID'), 'utf8').trim(), userDataIncluded: false, requiresFrontendNpmCi: true }, null, 2));
  execFileSync(process.execPath, ['-e', "require('./dalat_tiktok_carousel_tool_standalone.cjs'); require('sharp')({create:{width:2,height:2,channels:3,background:'#f80'}}).png().toBuffer().then(()=>console.log('PASS isolated bundle import and native image decoder'))"], { cwd: path.join(output, 'backend'), stdio: 'inherit' });
  console.log('Built isolated matching artifact:', output);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
