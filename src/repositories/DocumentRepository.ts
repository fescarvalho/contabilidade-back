import { prisma } from '../lib/prisma';

export const DocumentRepository = {
  
  // ✅ Agora aceita 'page' e 'limit'
  findByUserId: async (userId: number, month?: string, year?: string, page = 1, limit = 10) => {
    let dateFilter = {};

    // Configura o filtro de data
    if (month && year) {
      const start = new Date(Number(year), Number(month) - 1, 1);
      const end = new Date(Number(year), Number(month), 1);
      
      dateFilter = {
        data_upload: {
          gte: start,
          lt: end,
        }
      };
    }

    const where = {
      user_id: userId,
      ...dateFilter
    };

    // 🚀 O Pulo do Gato: Prisma Transaction
    // Fazemos duas consultas ao mesmo tempo: Contar o total E pegar os dados.
    const [total, documents] = await prisma.$transaction([
      prisma.documents.count({ where }), // 1. Conta quantos existem no total
      prisma.documents.findMany({        // 2. Pega apenas a página atual
        where,
        take: limit,               // Pega X itens
        skip: (page - 1) * limit,  // Pula os anteriores
        orderBy: {
          data_upload: 'desc'
        }
      })
    ]);

    return {
      data: documents,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit
      }
    };
  },

  create: async (data: { userId: number, titulo: string, url: string, nomeOriginal: string, tamanho: number, formato: string }) => {
    return await prisma.documents.create({
      data: {
        user_id: data.userId,
        titulo: data.titulo,
        url_arquivo: data.url,
        nome_original: data.nomeOriginal,
        tamanho_bytes: data.tamanho,
        formato: data.formato
      }
    });
  },

  markAsViewed: async (docId: number, userId: number) => {
    await prisma.documents.updateMany({
        where: { id: docId, user_id: userId },
        data: { visualizado_em: new Date() }
    });
  },

  delete: async (docId: number) => {
      return await prisma.documents.delete({
          where: { id: docId }
      });
  },

  findById: async (docId: number) => {
      return await prisma.documents.findUnique({
          where: { id: docId }
      });
  }
};