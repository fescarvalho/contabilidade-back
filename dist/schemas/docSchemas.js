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
        // Mudamos para string porque o FormData envia tudo como texto
        cliente_id: zod_1.z.string().min(1, "O ID do cliente é obrigatório"),
        titulo: zod_1.z.string().min(1, "O título é obrigatório"),
        // Aceita string de data ou string vazia (quando não preenchido)
        vencimento: zod_1.z.string().optional().or(zod_1.z.literal("")),
    }),
    // Validação do arquivo vindo do Multer
    file: zod_1.z
        .object({
        mimetype: zod_1.z
            .string()
            .refine((val) => [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg",
            "image/png",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ].includes(val), "Formato de arquivo não suportado"),
        size: zod_1.z.number().max(5 * 1024 * 1024, "O arquivo deve ter no máximo 5MB"),
    })
        .optional(),
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
