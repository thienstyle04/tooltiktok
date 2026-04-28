"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuideController = void 0;
const common_1 = require("@nestjs/common");
const path = __importStar(require("node:path"));
const guide_service_1 = require("./guide.service");
let GuideController = class GuideController {
    constructor(guideService) {
        this.guideService = guideService;
    }
    getIndex() {
        return this.guideService.getFrontendTextFile('index.html');
    }
    getStyles() {
        return this.guideService.getFrontendTextFile('styles.css');
    }
    getJsFiles(fileName) {
        return this.guideService.getFrontendTextFile(`js/${fileName}`);
    }
    getFontAsset(fileName, response) {
        const body = this.guideService.getFrontendBinaryFile(path.join('fonts', fileName));
        response.setHeader('Content-Type', this.guideService.guessMime(fileName));
        response.setHeader('Content-Length', body.length);
        response.send(body);
    }
    getHealth() {
        return { status: 'ok' };
    }
    getGuideData() {
        return this.guideService.getDataset();
    }
    generateDeepSeekCaption(request) {
        return this.guideService.generateDeepSeekCaption(request);
    }
    generateDeckFromCaption(request) {
        return this.guideService.generateDeckFromCaption(request);
    }
    deleteGeneratedList(deckId, listId) {
        this.guideService.deleteGeneratedList(deckId, listId);
    }
    getDalatAsset(fileName, response) {
        const body = this.guideService.getDalatAsset(fileName);
        response.setHeader('Content-Type', this.guideService.guessMime(fileName));
        response.setHeader('Content-Length', body.length);
        response.send(body);
    }
    getTiktokAsset(folderName, fileName, response) {
        const body = this.guideService.getTiktokAsset(folderName, fileName);
        response.setHeader('Content-Type', this.guideService.guessMime(fileName));
        response.setHeader('Content-Length', body.length);
        response.send(body);
    }
    getWorkspaceAssetFromQuery(queryPath, response) {
        const body = this.guideService.getWorkspaceAsset(queryPath);
        response.setHeader('Content-Type', this.guideService.guessMime(queryPath));
        response.setHeader('Content-Length', body.length);
        response.send(body);
    }
    getLibraryAssetFromQuery(queryPath, rootKey, response) {
        const body = this.guideService.getLibraryAsset(queryPath, String(rootKey ?? '').trim() || 'main');
        response.setHeader('Content-Type', this.guideService.guessMime(queryPath));
        response.setHeader('Content-Length', body.length);
        response.send(body);
    }
    async getDriveFileAssetFromQuery(fileId, response) {
        const asset = await this.guideService.getDriveFileAsset(fileId);
        response.setHeader('Content-Type', asset.contentType);
        response.setHeader('Content-Length', asset.contentLength);
        response.send(asset.body);
    }
};
exports.GuideController = GuideController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)('Content-Type', 'text/html; charset=utf-8'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], GuideController.prototype, "getIndex", null);
__decorate([
    (0, common_1.Get)('styles.css'),
    (0, common_1.Header)('Content-Type', 'text/css; charset=utf-8'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], GuideController.prototype, "getStyles", null);
__decorate([
    (0, common_1.Get)('js/:fileName'),
    (0, common_1.Header)('Content-Type', 'application/javascript; charset=utf-8'),
    __param(0, (0, common_1.Param)('fileName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", String)
], GuideController.prototype, "getJsFiles", null);
__decorate([
    (0, common_1.Get)('fonts/:fileName'),
    __param(0, (0, common_1.Param)('fileName')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], GuideController.prototype, "getFontAsset", null);
__decorate([
    (0, common_1.Get)('api/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], GuideController.prototype, "getHealth", null);
__decorate([
    (0, common_1.Get)('api/guide-data'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], GuideController.prototype, "getGuideData", null);
__decorate([
    (0, common_1.Post)('api/ai/deepseek/caption'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GuideController.prototype, "generateDeepSeekCaption", null);
__decorate([
    (0, common_1.Post)('api/decks/generate-from-caption'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], GuideController.prototype, "generateDeckFromCaption", null);
__decorate([
    (0, common_1.Delete)('api/decks/:deckId/lists/:listId'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('deckId')),
    __param(1, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], GuideController.prototype, "deleteGeneratedList", null);
__decorate([
    (0, common_1.Get)('assets/dalat/:fileName'),
    __param(0, (0, common_1.Param)('fileName')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], GuideController.prototype, "getDalatAsset", null);
__decorate([
    (0, common_1.Get)('assets/tiktok/:folderName/:fileName'),
    __param(0, (0, common_1.Param)('folderName')),
    __param(1, (0, common_1.Param)('fileName')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], GuideController.prototype, "getTiktokAsset", null);
__decorate([
    (0, common_1.Get)('assets/workspace'),
    __param(0, (0, common_1.Query)('path')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], GuideController.prototype, "getWorkspaceAssetFromQuery", null);
__decorate([
    (0, common_1.Get)('assets/library'),
    __param(0, (0, common_1.Query)('path')),
    __param(1, (0, common_1.Query)('root')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], GuideController.prototype, "getLibraryAssetFromQuery", null);
__decorate([
    (0, common_1.Get)('assets/drive-file'),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GuideController.prototype, "getDriveFileAssetFromQuery", null);
exports.GuideController = GuideController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [guide_service_1.GuideService])
], GuideController);
