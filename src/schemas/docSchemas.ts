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
    // Mudamos para string porque o FormData envia tudo como texto
    cliente_id: z.string().min(1, "O ID do cliente é obrigatório"),
    titulo: z.string().min(1, "O título é obrigatório"),
    // Aceita string de data ou string vazia (quando não preenchido)
    vencimento: z.string().optional().or(z.literal("")),
  }),
  // Validação do arquivo vindo do Multer
  file: z
    .object({
      mimetype: z
        .string()
        .refine(
          (val) =>
            [
              "application/pdf",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "image/jpeg",
              "image/png",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ].includes(val),
          "Formato de arquivo não suportado",
        ),
      size: z.number().max(5 * 1024 * 1024, "O arquivo deve ter no máximo 5MB"),
    })
    .optional(),
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
