import { prisma } from "../lib/prisma";

export const NotificationRepository = {
  // 1. Criar uma nova notificação
  create: async (userId: number, titulo: string, mensagem: string, link?: string) => {
    return await prisma.notifications.create({
      data: {
        user_id: userId,
        titulo,
        mensagem,
        link
      }
    });
  },

  // 2. Listar notificações de um usuário (apenas as não lidas ou todas)
  findByUser: async (userId: number) => {
    return await prisma.notifications.findMany({
      where: { user_id: userId },
      orderBy: { criado_em: 'desc' },
      take: 20 // Pega as últimas 20 para não pesar
    });
  },

  // 3. Marcar como lida (quando o cliente clica no sininho)
  markAsRead: async (notifId: number) => {
    return await prisma.notifications.update({
      where: { id: notifId },
      data: { lida: true }
    });
  },
  
  // 4. Marcar TODAS como lidas
  markAllRead: async (userId: number) => {
      return await prisma.notifications.updateMany({
          where: { user_id: userId, lida: false },
          data: { lida: true }
      });
  }
};