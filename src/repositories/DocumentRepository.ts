import { prisma } from "../lib/prisma";

export const DocumentRepository = {
  // ✅ Agora aceita 'page' e 'limit'
  findByUserId: async (
    userId: number,
    month?: string,
    year?: string,
    page: number = 1,
    limit: number = 10,
  ) => {
    const skip = (page - 1) * limit;

    // Configuração do filtro de data
    let where: any = { user_id: userId };
    if (month && year) {
      const start = new Date(Number(year), Number(month) - 1, 1);
      const end = new Date(Number(year), Number(month), 1);
      where.data_upload = { gte: start, lt: end };
    }

    // Executa a contagem e a busca em uma transação para performance
    const [total, data] = await prisma.$transaction([
      prisma.documents.count({ where }),
      prisma.documents.findMany({
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

  create: async (data: {
    userId: number;
    titulo: string;
    url: string;
    nomeOriginal: string;
    tamanho: number;
    formato: string;
    dataVencimento?: Date;
  }) => {
    return await prisma.documents.create({
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

  markAsViewed: async (docId: number, userId: number) => {
    await prisma.documents.updateMany({
      where: { id: docId, user_id: userId },
      data: { visualizado_em: new Date() },
    });
  },

  delete: async (docId: number) => {
    return await prisma.documents.delete({
      where: { id: docId },
    });
  },

  findById: async (docId: number) => {
    return await prisma.documents.findUnique({
      where: { id: docId },
    });
  },
};
