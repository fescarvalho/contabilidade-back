import { Router, Response } from 'express';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import { prisma } from '../lib/prisma'; // ✅ Importando o Prisma Client
import { DocumentRepository } from '../repositories/DocumentRepository';
import { enviarEmailNovoDocumento } from '../services/emailService';
import { verificarToken, AuthRequest } from '../middlewares/auth';

import { validate } from '../middlewares/validateResource';
import { 
  uploadSchema, 
  deleteDocumentSchema, 
  searchClientSchema, 
  getClientDetailsSchema 
} from '../schemas/docSchemas';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- HELPER: Serializar BigInt para JSON ---
// (Evita erro "Do not know how to serialize a BigInt")
const serializeBigInt = (data: any) => {
    return JSON.parse(JSON.stringify(data, (_, v) => 
        typeof v === 'bigint' ? v.toString() : v
    ));
};

// --- HELPER: Verificar se é Admin ---
const checkAdmin = async (userId: number) => {
    const user = await prisma.users.findUnique({ 
        where: { id: userId },
        select: { tipo_usuario: true }
    });
    return user?.tipo_usuario === 'admin';
};

// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (Cliente Logado)
// ======================================================
router.get('/meus-documentos', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ msg: "Usuário não identificado." });

    const { month, year } = req.query;

    const documentos = await DocumentRepository.findByUserId(
        req.userId, 
        month as string | undefined, 
        year as string | undefined
    );
    
    return res.json(serializeBigInt(documentos));

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao buscar documentos" });
  }
});

// ======================================================
// 2. UPLOAD (POST) - Com Zod e Multer
// ======================================================
router.post(
  '/upload', 
  verificarToken, 
  upload.single('arquivo'), 
  validate(uploadSchema), 
  async (req: AuthRequest, res: Response) => {
  
  try {
    if (!req.userId || !(await checkAdmin(req.userId))) {
        return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
    }

    const { cliente_id, titulo } = req.body; 
    const file = req.file;

    if (!file) return res.status(400).json({ msg: "Selecione um arquivo para enviar." });

    // ✅ Verifica se o cliente existe e pega o EMAIL com Prisma
    const dadosCliente = await prisma.users.findUnique({
        where: { id: Number(cliente_id) },
        select: { id: true, nome: true, email: true }
    });

    if (!dadosCliente) {
        return res.status(404).json({ msg: `Erro: O cliente com ID ${cliente_id} não existe.` });
    }

    // Upload para a Vercel Blob
    const blob = await put(file.originalname, file.buffer, { 
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: true
    });

    // ✅ Salva no banco usando o Repositório
    const novoDoc = await DocumentRepository.create({
        userId: Number(cliente_id),
        titulo: titulo,
        url: blob.url,
        nomeOriginal: file.originalname,
        tamanho: file.size,
        formato: file.mimetype
    });

    // ✅ ENVIO DE E-MAIL
    if (dadosCliente.email) {
        enviarEmailNovoDocumento(dadosCliente.email, dadosCliente.nome, titulo)
            .catch(err => console.error("Erro assíncrono no envio de e-mail:", err));
    } else {
        console.warn(`Cliente ${dadosCliente.nome} não tem e-mail cadastrado.`);
    }

    return res.json({ 
        msg: `Arquivo enviado para ${dadosCliente.nome} com sucesso!`, 
        documento: serializeBigInt(novoDoc)
    });
  
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro no servidor" });
  }
});

// ======================================================
// 3. DELETAR DOCUMENTO (Somente Admin)
// ======================================================
router.delete('/documentos/:id', verificarToken, validate(deleteDocumentSchema), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    if (!req.userId || !(await checkAdmin(req.userId))) {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    // ✅ Busca o documento para pegar a URL (para deletar do Blob)
    const documento = await DocumentRepository.findById(Number(id));
    
    if (!documento) {
      return res.status(404).json({ msg: "Documento não encontrado." });
    }

    // Apagar da Vercel
    if (documento.url_arquivo) {
        try {
            await del(documento.url_arquivo, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (error) {
            console.error("Erro ao apagar do Blob:", error);
        }
    }

    // ✅ Deleta do banco com Prisma
    await DocumentRepository.delete(Number(id));

    return res.json({ msg: "Documento apagado com sucesso." });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao deletar documento." });
  }
});

// ======================================================
// 4. BUSCAR CLIENTE (Busca Parcial)
// ======================================================
router.get('/clientes/buscar', verificarToken, validate(searchClientSchema), async (req: AuthRequest, res: Response) => {
  const nome = (req.query.nome as string).trim();

  try {
    if (!req.userId || !(await checkAdmin(req.userId))) {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    // ✅ Busca com Prisma (ILIKE vira mode: 'insensitive')
    const clientes = await prisma.users.findMany({
        where: {
            tipo_usuario: 'cliente',
            nome: {
                contains: nome,
                mode: 'insensitive' // Ignora maiúsculas/minúsculas
            }
        },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, email: true, cpf: true, telefone: true }
    });
    
    return res.json(clientes);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao buscar cliente." });
  }
});

// ======================================================
// 5. DETALHES DE UM CLIENTE + DOCUMENTOS (COM FILTRO)
// ======================================================
router.get('/clientes/:id/documentos', verificarToken, validate(getClientDetailsSchema), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { month, year } = req.query;

  try {
    if (!req.userId || !(await checkAdmin(req.userId))) {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    // Configura filtro de data
    let dateFilter = {};
    if (month && year) {
        const start = new Date(Number(year), Number(month) - 1, 1);
        const end = new Date(Number(year), Number(month), 1);
        dateFilter = {
            data_upload: { gte: start, lt: end }
        };
    }

    // ✅ Query poderosa do Prisma: Busca usuário E seus documentos (JOIN)
    const cliente = await prisma.users.findUnique({
        where: { id: Number(id) },
        select: {
            id: true, nome: true, email: true, cpf: true, telefone: true,
            documents: {
                where: dateFilter,
                orderBy: { data_upload: 'desc' },
                select: {
                    id: true, // Frontend espera 'id' ou 'id_doc'? Vamos mapear abaixo.
                    titulo: true,
                    url_arquivo: true,
                    tamanho_bytes: true,
                    formato: true,
                    data_upload: true,
                    visualizado_em: true
                }
            }
        }
    });

    if (!cliente) {
      return res.status(404).json({ msg: "Cliente não encontrado." });
    }

    // Ajuste fino para manter compatibilidade com o Frontend (mapear 'id' para 'id_doc' se necessário)
    // O frontend que fizemos usa `doc.id || doc.id_doc`, então o `id` nativo do Prisma funciona.
    const resposta = {
        ...cliente,
        documentos: cliente.documents.map((d: any) => ({
            ...d,
            id_doc: d.id, // Mantendo compatibilidade legada
            url: d.url_arquivo // Mantendo compatibilidade legada
        }))
    };
    
    return res.json(serializeBigInt(resposta));

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao carregar detalhes." });
  }
});

// ======================================================
// 6. CONFIRMAÇÃO DE LEITURA
// ======================================================
router.patch('/documents/:id/visualizar', verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  
  try {
    if (!req.userId) return res.status(401).json({ msg: "Erro auth" });

    // ✅ Usa o repositório
    await DocumentRepository.markAsViewed(Number(id), req.userId);
    
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao marcar visualização:", err);
    return res.status(500).json({ msg: "Erro ao registrar leitura" });
  }
});

// ======================================================
// 7. DASHBOARD DE VISÃO GERAL (BI)
// ======================================================
router.get('/dashboard/resumo', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || !(await checkAdmin(req.userId))) {
        return res.status(403).json({ msg: "Acesso negado." });
    }

    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

    // ✅ Executa queries em paralelo para ser mais rápido
    const [clientesAtivos, uploadsMes, totalDocs, docsVisualizados, pendencias] = await Promise.all([
        // 1. Total Clientes
        prisma.users.count({ where: { tipo_usuario: 'cliente' } }),
        
        // 2. Uploads Mês
        prisma.documents.count({
            where: {
                data_upload: { gte: inicioMes, lt: inicioProxMes }
            }
        }),

        // 3. Stats Leitura (Total)
        prisma.documents.count(),

        // 4. Stats Leitura (Vistos)
        prisma.documents.count({ where: { visualizado_em: { not: null } } }),

        // 5. Pendências (Últimos 5 não lidos)
        prisma.documents.findMany({
            where: { visualizado_em: null },
            orderBy: { data_upload: 'desc' },
            take: 5,
            select: {
                id: true, titulo: true, data_upload: true,
                users: { select: { nome: true } } // JOIN com usuario para pegar nome
            }
        })
    ]);

    const taxaLeitura = totalDocs === 0 ? 0 : Math.round((docsVisualizados / totalDocs) * 100);

    // Formatar pendências para o formato que o front espera (flatten)
    const pendenciasFormatadas = pendencias.map((p: any )=> ({
        id: p.id,
        titulo: p.titulo,
        data_upload: p.data_upload,
        cliente_nome: p.users?.nome || "Desconhecido"
    }));

    return res.json({
      clientesAtivos,
      uploadsMes,
      taxaLeitura,
      pendencias: pendenciasFormatadas
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao carregar dashboard." });
  }
});

export default router;