import * as fs from 'fs';
import * as path from 'path';
import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';

const toolRoot = resolveBackendRoot(__dirname);
const imageMappingPath = path.join(resolveBackendDataDir(toolRoot), 'image-mapping.json');

function normalizeText(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

const mapping = JSON.parse(fs.readFileSync(imageMappingPath, 'utf-8'));
const libraryRoots = [
    { key: 'main', path: mapping.libraryRoot },
    ...(mapping.extraLibraryRoots || []).map((p: string, i: number) => ({ key: `extra_${i}`, path: p }))
];

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.jfif']);

function findFolder(targetName: string) {
    const normTarget = normalizeText(targetName);
    const results: any[] = [];

    for (const root of libraryRoots) {
        if (!root.path || !fs.existsSync(root.path)) continue;
        try {
            const firstLevels = fs.readdirSync(root.path, { withFileTypes: true });
            for (const dl of firstLevels) {
                if (!dl.isDirectory()) continue;
                const normFolder = normalizeText(dl.name);
                if (normFolder.includes(normTarget) || normTarget.includes(normFolder)) {
                    results.push({ root: root.path, folder: dl.name, fullPath: path.join(root.path, dl.name) });
                }
                
                // Second level
                const p = path.join(root.path, dl.name);
                const secondLevels = fs.readdirSync(p, { withFileTypes: true });
                for (const d2 of secondLevels) {
                    if (!d2.isDirectory()) continue;
                    const normFolder2 = normalizeText(d2.name);
                    if (normFolder2.includes(normTarget) || normTarget.includes(normFolder2)) {
                        results.push({ root: root.path, folder: dl.name + '/' + d2.name, fullPath: path.join(p, d2.name) });
                    }
                }
            }
        } catch (e) {}
    }
    return results;
}

console.log('--- KIỂM TRA MAPPING ---');
console.log('1. Biệt Thự Đống Đa:');
console.log(findFolder('Biệt Thự Đống Đa'));

console.log('\n2. Cafe Mê Lá:');
console.log(findFolder('Mê Lá'));
console.log(findFolder('Me La'));
