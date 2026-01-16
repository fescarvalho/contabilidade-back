"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientDetailsSchema = exports.searchClientSchema = exports.deleteDocumentSchema = exports.uploadSchema = void 0;
const zod_1 = require("zod");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "image/jpeg",
    "image/png",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
];
exports.uploadSchema = zod_1.z.object({
    body: zod_1.z.object({
        cliente_id: zod_1.z.string(),
        titulo: zod_1.z.string(),
        vencimento: zod_1.z.string().optional(),
    }),
    // Se você valida o arquivo aqui:
    file: zod_1.z.any().refine((file) => ACCEPTED_TYPES.includes(file?.mimetype), {
        message: "Apenas PDF, Word, Excel e Imagens são aceitos.",
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
