"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const blob_1 = require("@vercel/blob");
const prisma_1 = require("../lib/prisma");
const DocumentRepository_1 = require("../repositories/DocumentRepository");
const emailService_1 = require("../services/emailService");
const auth_1 = require("../middlewares/auth");
const validateResource_1 = require("../middlewares/validateResource");
const NotificationRepository_1 = require("../repositories/NotificationRepository");
const server_1 = require("../server");
const docSchemas_1 = require("../schemas/docSchemas");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const serializeBigInt = (data) => {
    return JSON.parse(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};
const checkAdmin = async (userId) => {
    const user = await prisma_1.prisma.users.findUnique({
        where: { id: userId },
        select: { tipo_usuario: true },
    });
    return user?.tipo_usuario === "admin";
};
// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (Cliente)
// ======================================================
router.get("/meus-documentos", auth_1.verificarToken, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ msg: "Usuário não identificado." });
        const { month, year } = req.query;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const resultado = await DocumentRepository_1.DocumentRepository.findByUserId(req.userId, month, year, page, limit);
        return res.json(serializeBigInt(resultado));
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao buscar documentos" });
    }
});
// ======================================================
// 2. UPLOAD (POST) - COM NOTIFICAÇÃO ✅
// ======================================================
router.post("/upload", auth_1.verificarToken, upload.single("arquivo"), (0, validateResource_1.validate)(docSchemas_1.uploadSchema), async (req, res) => {
    try {
        if (!req.userId || !(await checkAdmin(req.userId))) {
            return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
        }
        const { cliente_id, titulo, vencimento } = req.body;
        const file = req.file;
        if (!file)
            return res.status(400).json({ msg: "Selecione um arquivo para enviar." });
        const dadosCliente = await prisma_1.prisma.users.findUnique({
            where: { id: Number(cliente_id) },
            select: { id: true, nome: true, email: true },
        });
        if (!dadosCliente) {
            return res
                .status(404)
                .json({ msg: `Erro: O cliente com ID ${cliente_id} não existe.` });
        }
        const blob = await (0, blob_1.put)(file.originalname, file.buffer, {
            access: "public",
            token: process.env.BLOB_READ_WRITE_TOKEN,
            addRandomSuffix: true,
        });
        const novoDoc = await DocumentRepository_1.DocumentRepository.create({
            userId: Number(cliente_id),
            titulo: titulo,
            url: blob.url,
            nomeOriginal: file.originalname,
            tamanho: file.size,
            formato: file.mimetype,
            dataVencimento: vencimento ? new Date(vencimento) : undefined,
        });
        // Envio de Email (Assíncrono)
        if (dadosCliente.email) {
            (0, emailService_1.enviarEmailNovoDocumento)(dadosCliente.email, dadosCliente.nome, titulo).catch((err) => console.error("Erro assíncrono no envio de e-mail:", err));
        }
        // ✅ LÓGICA DE NOTIFICAÇÃO (PERSISTÊNCIA + SOCKET)
        try {
            // 1. Salvar no Banco
            const novaNotificacao = await NotificationRepository_1.NotificationRepository.create(Number(cliente_id), "Novo Documento Recebido", `O documento "${titulo}" foi adicionado.`, novoDoc.url_arquivo // Link para o doc
            );
            // 2. Disparar Socket em Tempo Real
            server_1.io.to(`user_${cliente_id}`).emit("nova_notificacao", {
                id: novaNotificacao.id,
                titulo: novaNotificacao.titulo,
                mensagem: novaNotificacao.mensagem,
                lida: false,
                criado_em: novaNotificacao.criado_em
            });
            console.log(`🔔 Notificação enviada para user_${cliente_id}`);
        }
        catch (notifError) {
            console.error("Erro ao processar notificação (não crítico):", notifError);
        }
        return res.json({
            msg: `Arquivo enviado para ${dadosCliente.nome} com sucesso!`,
            documento: serializeBigInt(novoDoc),
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro no servidor" });
    }
});
// ======================================================
// 3. DELETAR DOCUMENTO
// ======================================================
router.delete("/documentos/:id", auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.deleteDocumentSchema), async (req, res) => {
    const { id } = req.params;
    try {
        if (!req.userId || !(await checkAdmin(req.userId))) {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        const documento = await DocumentRepository_1.DocumentRepository.findById(Number(id));
        if (!documento)
            return res.status(404).json({ msg: "Documento não encontrado." });
        if (documento.url_arquivo) {
            try {
                await (0, blob_1.del)(documento.url_arquivo, { token: process.env.BLOB_READ_WRITE_TOKEN });
            }
            catch (error) {
                console.error("Erro ao apagar do Blob:", error);
            }
        }
        await DocumentRepository_1.DocumentRepository.delete(Number(id));
        return res.json({ msg: "Documento apagado com sucesso." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao deletar documento." });
    }
});
// ======================================================
// 4. BUSCAR CLIENTE
// ======================================================
router.get("/clientes/buscar", auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.searchClientSchema), async (req, res) => {
    const nome = req.query.nome.trim();
    try {
        if (!req.userId || !(await checkAdmin(req.userId)))
            return res.status(403).json({ msg: "Acesso negado." });
        const clientes = await prisma_1.prisma.users.findMany({
            where: {
                tipo_usuario: "cliente",
                nome: { contains: nome, mode: "insensitive" },
            },
            orderBy: { nome: "asc" },
            select: { id: true, nome: true, email: true, cpf: true, telefone: true },
        });
        return res.json(clientes);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao buscar cliente." });
    }
});
// ======================================================
// 5. DETALHES DO CLIENTE (Admin)
// ======================================================
router.get("/clientes/:id/documentos", auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.getClientDetailsSchema), async (req, res) => {
    const { id } = req.params;
    const { month, year } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    try {
        if (!req.userId || !(await checkAdmin(req.userId)))
            return res.status(403).json({ msg: "Acesso negado." });
        let dateFilter = { user_id: Number(id) };
        if (month && year) {
            const start = new Date(Number(year), Number(month) - 1, 1);
            const end = new Date(Number(year), Number(month), 1);
            dateFilter.data_upload = { gte: start, lt: end };
        }
        const [cliente, totalDocs, documentos] = await Promise.all([
            prisma_1.prisma.users.findUnique({
                where: { id: Number(id) },
                select: { id: true, nome: true, email: true, cpf: true, telefone: true },
            }),
            prisma_1.prisma.documents.count({ where: dateFilter }),
            prisma_1.prisma.documents.findMany({
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
                    data_vencimento: true,
                },
            }),
        ]);
        if (!cliente)
            return res.status(404).json({ msg: "Cliente não encontrado." });
        const resposta = {
            cliente: cliente,
            documentos: {
                data: documentos.map((d) => ({
                    ...d,
                    id_doc: d.id,
                    url: d.url_arquivo,
                    data_vencimento: d.data_vencimento,
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
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao carregar detalhes." });
    }
});
// ======================================================
// 6. CONFIRMAÇÃO DE LEITURA
// ======================================================
router.patch("/documents/:id/visualizar", auth_1.verificarToken, async (req, res) => {
    const { id } = req.params;
    try {
        if (!req.userId)
            return res.status(401).json({ msg: "Erro auth" });
        await DocumentRepository_1.DocumentRepository.markAsViewed(Number(id), req.userId);
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("Erro ao marcar visualização:", err);
        return res.status(500).json({ msg: "Erro ao registrar leitura" });
    }
});
// ======================================================
// 7. DASHBOARD (BI)
// ======================================================
router.get("/dashboard/resumo", auth_1.verificarToken, async (req, res) => {
    try {
        if (!req.userId || !(await checkAdmin(req.userId)))
            return res.status(403).json({ msg: "Acesso negado." });
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const inicioProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        const [clientesAtivos, uploadsMes, totalDocs, docsVisualizados, pendencias] = await Promise.all([
            prisma_1.prisma.users.count({ where: { tipo_usuario: "cliente" } }),
            prisma_1.prisma.documents.count({
                where: { data_upload: { gte: inicioMes, lt: inicioProxMes } },
            }),
            prisma_1.prisma.documents.count(),
            prisma_1.prisma.documents.count({ where: { visualizado_em: { not: null } } }),
            prisma_1.prisma.documents.findMany({
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
        const taxaLeitura = totalDocs === 0 ? 0 : Math.round((docsVisualizados / totalDocs) * 100);
        const pendenciasFormatadas = pendencias.map((p) => ({
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
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao carregar dashboard." });
    }
});
// ======================================================
// 8. ROTAS DE NOTIFICAÇÕES (NOVAS) ✅
// ======================================================
// Listar notificações do usuário
router.get('/notifications/:userId', auth_1.verificarToken, async (req, res) => {
    try {
        const { userId } = req.params;
        // Segurança: Usuário só pode ver suas próprias notificações (a menos que seja admin)
        if (Number(userId) !== req.userId && !(await checkAdmin(req.userId))) {
            return res.status(403).json({ msg: "Acesso negado" });
        }
        const notificacoes = await NotificationRepository_1.NotificationRepository.findByUser(Number(userId));
        return res.json(notificacoes);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ msg: "Erro ao buscar notificações" });
    }
});
// Marcar como lida
router.patch('/notifications/:id/read', auth_1.verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        await NotificationRepository_1.NotificationRepository.markAsRead(Number(id));
        return res.json({ msg: "Lida" });
    }
    catch (error) {
        return res.status(500).json({ msg: "Erro ao atualizar notificação" });
    }
});
// Marcar todas como lidas
router.patch('/notifications/read-all', auth_1.verificarToken, async (req, res) => {
    try {
        const { userId } = req.body;
        if (Number(userId) !== req.userId) {
            return res.status(403).json({ msg: "Acesso negado" });
        }
        await NotificationRepository_1.NotificationRepository.markAllRead(Number(userId));
        return res.json({ msg: "Todas marcadas como lidas" });
    }
    catch (error) {
        return res.status(500).json({ msg: "Erro ao limpar notificações" });
    }
});
exports.default = router;
