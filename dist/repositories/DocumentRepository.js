"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentRepository = void 0;
const prisma_1 = require("../lib/prisma");
exports.DocumentRepository = {
    // 1. Buscar documentos (com filtro opcional de Mês/Ano)
    findByUserId: async (userId, month, year) => {
        let dateFilter = {};
        // Se tiver Mês e Ano, criamos um intervalo de datas (Do dia 1 até o último dia)
        if (month && year) {
            const start = new Date(Number(year), Number(month) - 1, 1); // Dia 1 do mês atual
            const end = new Date(Number(year), Number(month), 1); // Dia 1 do mês seguinte
            dateFilter = {
                data_upload: {
                    gte: start, // Maior ou igual ao inicio
                    lt: end, // Menor que o inicio do próximo mês
                }
            };
        }
        return await prisma_1.prisma.documents.findMany({
            where: {
                user_id: userId,
                ...dateFilter // Aplica o filtro se existir
            },
            orderBy: {
                data_upload: 'desc' // Ordena do mais recente para o antigo
            }
        });
    },
    // 2. Criar novo documento
    create: async (data) => {
        return await prisma_1.prisma.documents.create({
            data: {
                user_id: data.userId,
                titulo: data.titulo,
                url_arquivo: data.url,
                nome_original: data.nomeOriginal,
                tamanho_bytes: data.tamanho, // O Prisma lida com BigInt automaticamente
                formato: data.formato
            }
        });
    },
    // 3. Marcar como visualizado
    markAsViewed: async (docId, userId) => {
        await prisma_1.prisma.documents.updateMany({
            where: {
                id: docId,
                user_id: userId // Segurança: garante que o doc é do usuário
            },
            data: {
                visualizado_em: new Date()
            }
        });
    },
    // 4. Deletar documento
    delete: async (docId) => {
        return await prisma_1.prisma.documents.delete({
            where: { id: docId }
        });
    },
    // 5. Buscar um documento pelo ID (útil para deletar)
    findById: async (docId) => {
        return await prisma_1.prisma.documents.findUnique({
            where: { id: docId }
        });
    }
};
