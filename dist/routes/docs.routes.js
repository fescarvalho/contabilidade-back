"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const blob_1 = require("@vercel/blob");
const prisma_1 = require("../lib/prisma"); // ✅ Importando o Prisma Client
const DocumentRepository_1 = require("../repositories/DocumentRepository");
const emailService_1 = require("../services/emailService");
const auth_1 = require("../middlewares/auth");
const validateResource_1 = require("../middlewares/validateResource");
const docSchemas_1 = require("../schemas/docSchemas");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// --- HELPER: Serializar BigInt para JSON ---
// (Evita erro "Do not know how to serialize a BigInt")
const serializeBigInt = (data) => {
    return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v));
};
// --- HELPER: Verificar se é Admin ---
const checkAdmin = async (userId) => {
    const user = await prisma_1.prisma.users.findUnique({
        where: { id: userId },
        select: { tipo_usuario: true }
    });
    return user?.tipo_usuario === 'admin';
};
// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (Com Paginação)
// ======================================================
router.get('/meus-documentos', auth_1.verificarToken, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ msg: "Usuário não identificado." });
        const { month, year } = req.query;
        // Pegamos a página e o limite da query (ou usamos padrão 1 e 10)
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const resultado = await DocumentRepository_1.DocumentRepository.findByUserId(req.userId, month, year, page, limit);
        // Serializa o BigInt tanto nos dados quanto nos metadados (se houver)
        return res.json(serializeBigInt(resultado));
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao buscar documentos" });
    }
});
// ======================================================
// 2. UPLOAD (POST) - Com Zod e Multer
// ======================================================
router.post('/upload', auth_1.verificarToken, upload.single('arquivo'), (0, validateResource_1.validate)(docSchemas_1.uploadSchema), async (req, res) => {
    try {
        if (!req.userId || !(await checkAdmin(req.userId))) {
            return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
        }
        const { cliente_id, titulo } = req.body;
        const file = req.file;
        if (!file)
            return res.status(400).json({ msg: "Selecione um arquivo para enviar." });
        // ✅ Verifica se o cliente existe e pega o EMAIL com Prisma
        const dadosCliente = await prisma_1.prisma.users.findUnique({
            where: { id: Number(cliente_id) },
            select: { id: true, nome: true, email: true }
        });
        if (!dadosCliente) {
            return res.status(404).json({ msg: `Erro: O cliente com ID ${cliente_id} não existe.` });
        }
        // Upload para a Vercel Blob
        const blob = await (0, blob_1.put)(file.originalname, file.buffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
            addRandomSuffix: true
        });
        // ✅ Salva no banco usando o Repositório
        const novoDoc = await DocumentRepository_1.DocumentRepository.create({
            userId: Number(cliente_id),
            titulo: titulo,
            url: blob.url,
            nomeOriginal: file.originalname,
            tamanho: file.size,
            formato: file.mimetype
        });
        // ✅ ENVIO DE E-MAIL
        if (dadosCliente.email) {
            (0, emailService_1.enviarEmailNovoDocumento)(dadosCliente.email, dadosCliente.nome, titulo)
                .catch(err => console.error("Erro assíncrono no envio de e-mail:", err));
        }
        else {
            console.warn(`Cliente ${dadosCliente.nome} não tem e-mail cadastrado.`);
        }
        return res.json({
            msg: `Arquivo enviado para ${dadosCliente.nome} com sucesso!`,
            documento: serializeBigInt(novoDoc)
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro no servidor" });
    }
});
// ======================================================
// 3. DELETAR DOCUMENTO (Somente Admin)
// ======================================================
router.delete('/documentos/:id', auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.deleteDocumentSchema), async (req, res) => {
    const { id } = req.params;
    try {
        if (!req.userId || !(await checkAdmin(req.userId))) {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        // ✅ Busca o documento para pegar a URL (para deletar do Blob)
        const documento = await DocumentRepository_1.DocumentRepository.findById(Number(id));
        if (!documento) {
            return res.status(404).json({ msg: "Documento não encontrado." });
        }
        // Apagar da Vercel
        if (documento.url_arquivo) {
            try {
                await (0, blob_1.del)(documento.url_arquivo, { token: process.env.BLOB_READ_WRITE_TOKEN });
            }
            catch (error) {
                console.error("Erro ao apagar do Blob:", error);
            }
        }
        // ✅ Deleta do banco com Prisma
        await DocumentRepository_1.DocumentRepository.delete(Number(id));
        return res.json({ msg: "Documento apagado com sucesso." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao deletar documento." });
    }
});
// ======================================================
// 4. BUSCAR CLIENTE (Busca Parcial)
// ======================================================
router.get('/clientes/buscar', auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.searchClientSchema), async (req, res) => {
    const nome = req.query.nome.trim();
    try {
        if (!req.userId || !(await checkAdmin(req.userId))) {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        // ✅ Busca com Prisma (ILIKE vira mode: 'insensitive')
        const clientes = await prisma_1.prisma.users.findMany({
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
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao buscar cliente." });
    }
});
// 5. DETALHES DE UM CLIENTE + DOCUMENTOS (COM PAGINAÇÃO 🚀)
// ======================================================
router.get('/clientes/:id/documentos', auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.getClientDetailsSchema), async (req, res) => {
    const { id } = req.params;
    const { month, year } = req.query;
    // ✅ Paginação
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    try {
        if (!req.userId || !(await checkAdmin(req.userId))) {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        // Configura filtro de data
        let dateFilter = { user_id: Number(id) }; // Filtra pelo ID do usuário
        if (month && year) {
            const start = new Date(Number(year), Number(month) - 1, 1);
            const end = new Date(Number(year), Number(month), 1);
            dateFilter.data_upload = { gte: start, lt: end };
        }
        // ✅ Executa 3 operações em paralelo (Muito rápido)
        const [cliente, totalDocs, documentos] = await Promise.all([
            // 1. Busca dados do Cliente
            prisma_1.prisma.users.findUnique({
                where: { id: Number(id) },
                select: { id: true, nome: true, email: true, cpf: true, telefone: true }
            }),
            // 2. Conta TOTAL de documentos (para saber quantas páginas existem)
            prisma_1.prisma.documents.count({ where: dateFilter }),
            // 3. Busca documentos DA PÁGINA ATUAL
            prisma_1.prisma.documents.findMany({
                where: dateFilter,
                take: limit, // Pega 10
                skip: (page - 1) * limit, // Pula X
                orderBy: { data_upload: 'desc' },
                select: {
                    id: true, titulo: true, url_arquivo: true,
                    tamanho_bytes: true, formato: true,
                    data_upload: true, visualizado_em: true
                }
            })
        ]);
        if (!cliente) {
            return res.status(404).json({ msg: "Cliente não encontrado." });
        }
        // Monta a resposta no formato novo
        const resposta = {
            cliente: cliente, // Dados do cliente
            documentos: {
                data: documentos.map((d) => ({
                    ...d,
                    id_doc: d.id, // Compatibilidade
                    url: d.url_arquivo
                })),
                meta: {
                    total: totalDocs,
                    page,
                    lastPage: Math.ceil(totalDocs / limit),
                    limit
                }
            }
        };
        return res.json(serializeBigInt(resposta));
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao carregar detalhes." });
    }
});
// ======================================================
// 6. CONFIRMAÇÃO DE LEITURA
// ======================================================
router.patch('/documents/:id/visualizar', auth_1.verificarToken, async (req, res) => {
    const { id } = req.params;
    try {
        if (!req.userId)
            return res.status(401).json({ msg: "Erro auth" });
        // ✅ Usa o repositório
        await DocumentRepository_1.DocumentRepository.markAsViewed(Number(id), req.userId);
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("Erro ao marcar visualização:", err);
        return res.status(500).json({ msg: "Erro ao registrar leitura" });
    }
});
// ======================================================
// 7. DASHBOARD DE VISÃO GERAL (BI)
// ======================================================
router.get('/dashboard/resumo', auth_1.verificarToken, async (req, res) => {
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
            prisma_1.prisma.users.count({ where: { tipo_usuario: 'cliente' } }),
            // 2. Uploads Mês
            prisma_1.prisma.documents.count({
                where: {
                    data_upload: { gte: inicioMes, lt: inicioProxMes }
                }
            }),
            // 3. Stats Leitura (Total)
            prisma_1.prisma.documents.count(),
            // 4. Stats Leitura (Vistos)
            prisma_1.prisma.documents.count({ where: { visualizado_em: { not: null } } }),
            // 5. Pendências (Últimos 5 não lidos)
            prisma_1.prisma.documents.findMany({
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
        const pendenciasFormatadas = pendencias.map((p) => ({
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
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao carregar dashboard." });
    }
});
exports.default = router;
