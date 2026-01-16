"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentRepository = void 0;
const prisma_1 = require("../lib/prisma");
exports.DocumentRepository = {
    // ✅ Agora aceita 'page' e 'limit'
    findByUserId: async (userId, month, year, page = 1, limit = 10) => {
        const skip = (page - 1) * limit;
        // Configuração do filtro de data
        let where = { user_id: userId };
        if (month && year) {
            const start = new Date(Number(year), Number(month) - 1, 1);
            const end = new Date(Number(year), Number(month), 1);
            where.data_upload = { gte: start, lt: end };
        }
        // Executa a contagem e a busca em uma transação para performance
        const [total, data] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.documents.count({ where }),
            prisma_1.prisma.documents.findMany({
                where,
                take: limit,
                skip: skip,
                orderBy: { data_upload: "desc" },
                select: {
                    id: true,
                    titulo: true,
                    url_arquivo: true,
                    tamanho_bytes: true,
                    formato: true,
                    data_upload: true,
                    visualizado_em: true,
                    data_vencimento: true, // ✅ INDISPENSÁVEL PARA APARECER NO FRONT
                },
            }),
        ]);
        return {
            data: data.map((d) => ({
                ...d,
                id_doc: d.id,
                url: d.url_arquivo,
            })),
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                limit,
            },
        };
    },
    create: async (data) => {
        return await prisma_1.prisma.documents.create({
            data: {
                user_id: data.userId,
                titulo: data.titulo,
                url_arquivo: data.url,
                nome_original: data.nomeOriginal,
                tamanho_bytes: data.tamanho,
                formato: data.formato,
                data_vencimento: data.dataVencimento,
            },
        });
    },
    markAsViewed: async (docId, userId) => {
        await prisma_1.prisma.documents.updateMany({
            where: { id: docId, user_id: userId },
            data: { visualizado_em: new Date() },
        });
    },
    delete: async (docId) => {
        return await prisma_1.prisma.documents.delete({
            where: { id: docId },
        });
    },
    findById: async (docId) => {
        return await prisma_1.prisma.documents.findUnique({
            where: { id: docId },
        });
    },
};
