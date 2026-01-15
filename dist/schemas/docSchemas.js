"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientDetailsSchema = exports.searchClientSchema = exports.deleteDocumentSchema = exports.uploadSchema = void 0;
const zod_1 = require("zod");
exports.uploadSchema = zod_1.z.object({
    body: zod_1.z.object({
        // O Multer transforma tudo em string no req.body, então validamos como string
        // e checamos se é numérico
        cliente_id: zod_1.z.string().min(1, "ID do cliente é obrigatório").regex(/^\d+$/, "ID deve ser um número"),
        titulo: zod_1.z.string().min(1, "Título é obrigatório"),
    }),
});
exports.deleteDocumentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, "ID do documento inválido"),
    }),
});
exports.searchClientSchema = zod_1.z.object({
    query: zod_1.z.object({
        nome: zod_1.z.string().min(1, "Digite um nome para pesquisar"),
    }),
});
exports.getClientDetailsSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, "ID do cliente inválido"),
    }),
});
