import { z } from "zod";
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
export const uploadSchema = z.object({
  body: z.object({
    cliente_id: z.string(),
    titulo: z.string(),
    vencimento: z.string().optional(),
  }),
  // Se você valida o arquivo aqui:
  file: z.any().refine((file) => ACCEPTED_TYPES.includes(file?.mimetype), {
    message: "Apenas PDF, Word, Excel e Imagens são aceitos.",
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
