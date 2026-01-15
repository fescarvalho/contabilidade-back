import { z } from "zod";

export const uploadSchema = z.object({
  body: z.object({
    // O Multer transforma tudo em string no req.body, então validamos como string
    // e checamos se é numérico
    cliente_id: z.string().min(1, "ID do cliente é obrigatório").regex(/^\d+$/, "ID deve ser um número"),
    titulo: z.string().min(1, "Título é obrigatório"),
  }),
});

export const deleteDocumentSchema = z.object({
  params: z.object({
    id: z.string().min(1, "ID do documento inválido"),
  }),
});

export const searchClientSchema = z.object({
  query: z.object({
    nome: z.string().min(1, "Digite um nome para pesquisar"),
  }),
});

export const getClientDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, "ID do cliente inválido"),
  }),
});