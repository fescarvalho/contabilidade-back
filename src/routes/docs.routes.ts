import { Router, Response } from "express";
import multer from "multer";
import { put, del } from "@vercel/blob";
import { prisma } from "../lib/prisma";
import { DocumentRepository } from "../repositories/DocumentRepository";
import { enviarEmailNovoDocumento } from "../services/emailService";
import { verificarToken, AuthRequest } from "../middlewares/auth";

import { validate } from "../middlewares/validateResource";
import {
  uploadSchema,
  deleteDocumentSchema,
  searchClientSchema,
  getClientDetailsSchema,
} from "../schemas/docSchemas";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const serializeBigInt = (data: any) => {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
};

const checkAdmin = async (userId: number) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { tipo_usuario: true },
  });
  return user?.tipo_usuario === "admin";
};

// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (Cliente)
// ======================================================
router.get(
  "/meus-documentos",
  verificarToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) return res.status(401).json({ msg: "Usuário não identificado." });

      const { month, year } = req.query;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;

      // ✅ O DocumentRepository.findByUserId deve incluir data_vencimento no retorno
      const resultado = await DocumentRepository.findByUserId(
        req.userId,
        month as string | undefined,
        year as string | undefined,
        page,
        limit,
      );

      return res.json(serializeBigInt(resultado));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erro ao buscar documentos" });
    }
  },
);

// ======================================================
// 2. UPLOAD (POST) - CORRIGIDO ✅
// ======================================================
router.post(
  "/upload",
  verificarToken,
  upload.single("arquivo"),
  validate(uploadSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId || !(await checkAdmin(req.userId))) {
        return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
      }

      // ✅ ADICIONADO: 'vencimento' capturado do corpo da requisição
      const { cliente_id, titulo, vencimento } = req.body;
      const file = req.file;

      if (!file)
        return res.status(400).json({ msg: "Selecione um arquivo para enviar." });

      const dadosCliente = await prisma.users.findUnique({
        where: { id: Number(cliente_id) },
        select: { id: true, nome: true, email: true },
      });

      if (!dadosCliente) {
        return res
          .status(404)
          .json({ msg: `Erro: O cliente com ID ${cliente_id} não existe.` });
      }

      const blob = await put(file.originalname, file.buffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: true,
      });

      // ✅ CORREÇÃO: Passando dataVencimento para o repositório
      const novoDoc = await DocumentRepository.create({
        userId: Number(cliente_id),
        titulo: titulo,
        url: blob.url,
        nomeOriginal: file.originalname,
        tamanho: file.size,
        formato: file.mimetype,
        dataVencimento: vencimento ? new Date(vencimento) : undefined, // ✅ Mapeado aqui
      });

      if (dadosCliente.email) {
        enviarEmailNovoDocumento(dadosCliente.email, dadosCliente.nome, titulo).catch(
          (err) => console.error("Erro assíncrono no envio de e-mail:", err),
        );
      }

      return res.json({
        msg: `Arquivo enviado para ${dadosCliente.nome} com sucesso!`,
        documento: serializeBigInt(novoDoc),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erro no servidor" });
    }
  },
);

// ======================================================
// 3. DELETAR DOCUMENTO
// ======================================================
router.delete(
  "/documentos/:id",
  verificarToken,
  validate(deleteDocumentSchema),
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      if (!req.userId || !(await checkAdmin(req.userId))) {
        return res.status(403).json({ msg: "Acesso negado." });
      }
      const documento = await DocumentRepository.findById(Number(id));
      if (!documento) return res.status(404).json({ msg: "Documento não encontrado." });

      if (documento.url_arquivo) {
        try {
          await del(documento.url_arquivo, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (error) {
          console.error("Erro ao apagar do Blob:", error);
        }
      }

      await DocumentRepository.delete(Number(id));
      return res.json({ msg: "Documento apagado com sucesso." });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erro ao deletar documento." });
    }
  },
);

// ======================================================
// 4. BUSCAR CLIENTE
// ======================================================
router.get(
  "/clientes/buscar",
  verificarToken,
  validate(searchClientSchema),
  async (req: AuthRequest, res: Response) => {
    const nome = (req.query.nome as string).trim();
    try {
      if (!req.userId || !(await checkAdmin(req.userId)))
        return res.status(403).json({ msg: "Acesso negado." });

      const clientes = await prisma.users.findMany({
        where: {
          tipo_usuario: "cliente",
          nome: { contains: nome, mode: "insensitive" },
        },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, email: true, cpf: true, telefone: true },
      });
      return res.json(clientes);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erro ao buscar cliente." });
    }
  },
);

// ======================================================
// 5. DETALHES DO CLIENTE (Admin) - CORRIGIDO ✅
// ======================================================
router.get(
  "/clientes/:id/documentos",
  verificarToken,
  validate(getClientDetailsSchema),
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { month, year } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    try {
      if (!req.userId || !(await checkAdmin(req.userId)))
        return res.status(403).json({ msg: "Acesso negado." });

      let dateFilter: any = { user_id: Number(id) };
      if (month && year) {
        const start = new Date(Number(year), Number(month) - 1, 1);
        const end = new Date(Number(year), Number(month), 1);
        dateFilter.data_upload = { gte: start, lt: end };
      }

      const [cliente, totalDocs, documentos] = await Promise.all([
        prisma.users.findUnique({
          where: { id: Number(id) },
          select: { id: true, nome: true, email: true, cpf: true, telefone: true },
        }),
        prisma.documents.count({ where: dateFilter }),
        prisma.documents.findMany({
          where: dateFilter,
          take: limit,
          skip: (page - 1) * limit,
          orderBy: { data_upload: "desc" },
          select: {
            id: true,
            titulo: true,
            url_arquivo: true,
            tamanho_bytes: true,
            formato: true,
            data_upload: true,
            visualizado_em: true,
            data_vencimento: true, // ✅ ADICIONADO: Estava faltando no select!
          },
        }),
      ]);

      if (!cliente) return res.status(404).json({ msg: "Cliente não encontrado." });

      const resposta = {
        cliente: cliente,
        documentos: {
          data: documentos.map((d: any) => ({
            ...d,
            id_doc: d.id,
            url: d.url_arquivo,
            data_vencimento: d.data_vencimento, // ✅ Garante o mapeamento
          })),
          meta: {
            total: totalDocs,
            page,
            lastPage: Math.ceil(totalDocs / limit),
            limit,
          },
        },
      };
      return res.json(serializeBigInt(resposta));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erro ao carregar detalhes." });
    }
  },
);

// ======================================================
// 6. CONFIRMAÇÃO DE LEITURA
// ======================================================
router.patch(
  "/documents/:id/visualizar",
  verificarToken,
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      if (!req.userId) return res.status(401).json({ msg: "Erro auth" });
      await DocumentRepository.markAsViewed(Number(id), req.userId);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Erro ao marcar visualização:", err);
      return res.status(500).json({ msg: "Erro ao registrar leitura" });
    }
  },
);

// ======================================================
// 7. DASHBOARD (BI)
// ======================================================
router.get(
  "/dashboard/resumo",
  verificarToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId || !(await checkAdmin(req.userId)))
        return res.status(403).json({ msg: "Acesso negado." });

      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const inicioProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

      const [clientesAtivos, uploadsMes, totalDocs, docsVisualizados, pendencias] =
        await Promise.all([
          prisma.users.count({ where: { tipo_usuario: "cliente" } }),
          prisma.documents.count({
            where: { data_upload: { gte: inicioMes, lt: inicioProxMes } },
          }),
          prisma.documents.count(),
          prisma.documents.count({ where: { visualizado_em: { not: null } } }),
          prisma.documents.findMany({
            where: { visualizado_em: null },
            orderBy: { data_upload: "desc" },
            take: 5,
            select: {
              id: true,
              titulo: true,
              data_upload: true,
              users: { select: { nome: true } },
            },
          }),
        ]);

      const taxaLeitura =
        totalDocs === 0 ? 0 : Math.round((docsVisualizados / totalDocs) * 100);
      const pendenciasFormatadas = pendencias.map((p: any) => ({
        id: p.id,
        titulo: p.titulo,
        data_upload: p.data_upload,
        cliente_nome: p.users?.nome || "Desconhecido",
      }));

      return res.json({
        clientesAtivos,
        uploadsMes,
        taxaLeitura,
        pendencias: pendenciasFormatadas,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erro ao carregar dashboard." });
    }
  },
);

export default router;
