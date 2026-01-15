"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const blob_1 = require("@vercel/blob");
const db_1 = require("../db");
const emailService_1 = require("../services/emailService");
const auth_1 = require("../middlewares/auth");
const validateResource_1 = require("../middlewares/validateResource");
const docSchemas_1 = require("../schemas/docSchemas");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (Cliente Logado)
// ======================================================
// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (COM FILTRO DE DATA)
// ======================================================
router.get('/meus-documentos', auth_1.verificarToken, async (req, res) => {
    try {
        const { month, year } = req.query; // Pega da URL: ?month=01&year=2026
        let query = `
      SELECT id, user_id, titulo, url_arquivo, nome_original, tamanho_bytes, formato, data_upload, visualizado_em 
      FROM documents 
      WHERE user_id = $1
    `;
        const params = [req.userId];
        // Se tiver mês E ano, aplica o filtro
        if (month && year) {
            // $2 e $3 serão o mês e o ano
            query += ` AND EXTRACT(MONTH FROM data_upload) = $2 AND EXTRACT(YEAR FROM data_upload) = $3`;
            params.push(month, year);
        }
        query += ` ORDER BY data_upload DESC`;
        const resultado = await db_1.pool.query(query, params);
        return res.json(resultado.rows);
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
        // 1. Validação: Só Admin pode enviar
        const usuarioLogado = await db_1.pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
        if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
            return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
        }
        const { cliente_id, titulo } = req.body;
        const file = req.file;
        if (!file)
            return res.status(400).json({ msg: "Selecione um arquivo para enviar." });
        // ✅ Verifica se o cliente existe e pega o EMAIL
        const checkCliente = await db_1.pool.query('SELECT id, nome, email FROM users WHERE id = $1', [cliente_id]);
        if (checkCliente.rowCount === 0) {
            return res.status(404).json({
                msg: `Erro: O cliente com ID ${cliente_id} não existe.`
            });
        }
        // Upload para a Vercel Blob
        const blob = await (0, blob_1.put)(file.originalname, file.buffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
            addRandomSuffix: true
        });
        // Salva no banco (Agora inclui visualizado_em como NULL por padrão, mas é bom garantir na query se não tiver default no banco)
        const novoDoc = await db_1.pool.query(`INSERT INTO documents 
        (user_id, titulo, url_arquivo, nome_original, tamanho_bytes, formato) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *`, [cliente_id, titulo, blob.url, file.originalname, file.size, file.mimetype]);
        // ✅ ENVIO DE E-MAIL SEGURO
        const dadosCliente = checkCliente.rows[0];
        if (dadosCliente.email) {
            try {
                console.log(`Enviando aviso para ${dadosCliente.email}...`);
                // O await aqui é opcional se não quiser travar a resposta, mas garante o log correto
                (0, emailService_1.enviarEmailNovoDocumento)(dadosCliente.email, dadosCliente.nome, titulo)
                    .then(() => console.log("Aviso enviado."))
                    .catch(err => console.error("Erro assíncrono no envio:", err));
            }
            catch (emailErr) {
                console.error("Erro no envio de email:", emailErr);
            }
        }
        else {
            console.warn(`Cliente ${dadosCliente.nome} não tem e-mail cadastrado.`);
        }
        return res.json({
            msg: `Arquivo enviado para ${dadosCliente.nome} com sucesso!`,
            documento: novoDoc.rows[0]
        });
    }
    catch (err) {
        console.error(err);
        if (err.code === '22P02') {
            return res.status(400).json({ msg: "O ID do cliente precisa ser um número." });
        }
        return res.status(500).json({ msg: "Erro no servidor" });
    }
});
// ======================================================
// 3. DELETAR DOCUMENTO (Somente Admin)
// ======================================================
router.delete('/documentos/:id', auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.deleteDocumentSchema), async (req, res) => {
    const { id } = req.params;
    try {
        const usuarioLogado = await db_1.pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
        if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        const documento = await db_1.pool.query('SELECT * FROM documents WHERE id = $1', [id]);
        if (documento.rowCount === 0) {
            return res.status(404).json({ msg: "Documento não encontrado." });
        }
        const arquivoParaDeletar = documento.rows[0];
        // Apagar da Vercel
        if (arquivoParaDeletar.url_arquivo) {
            try {
                await (0, blob_1.del)(arquivoParaDeletar.url_arquivo, {
                    token: process.env.BLOB_READ_WRITE_TOKEN
                });
            }
            catch (error) {
                console.error("Erro ao apagar do Blob:", error);
            }
        }
        await db_1.pool.query('DELETE FROM documents WHERE id = $1', [id]);
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
        const usuarioLogado = await db_1.pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
        if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        const resultado = await db_1.pool.query(`SELECT id, nome, email, cpf, telefone 
       FROM users 
       WHERE tipo_usuario = 'cliente' 
       AND nome ILIKE $1 
       ORDER BY nome ASC`, [`%${nome}%`]);
        return res.json(resultado.rows);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao buscar cliente." });
    }
});
// ======================================================
// 5. DETALHES DE UM CLIENTE + DOCUMENTOS (COM FILTRO)
// ======================================================
router.get('/clientes/:id/documentos', auth_1.verificarToken, (0, validateResource_1.validate)(docSchemas_1.getClientDetailsSchema), async (req, res) => {
    const { id } = req.params;
    const { month, year } = req.query; // Captura os filtros da URL
    try {
        const usuarioLogado = await db_1.pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
        if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        // Prepara os parâmetros da query
        const params = [id];
        let filterClause = "";
        // Se tiver mês E ano, adiciona filtro na junção dos documentos
        // Usamos $2 e $3 porque $1 já é o ID do usuário
        if (month && year) {
            filterClause = `AND EXTRACT(MONTH FROM d.data_upload) = $2 AND EXTRACT(YEAR FROM d.data_upload) = $3`;
            params.push(month, year);
        }
        const query = `
      SELECT 
        u.id, u.nome, u.email, u.cpf, u.telefone,
        COALESCE(
          json_agg(
            json_build_object(
              'id_doc', d.id,
              'titulo', d.titulo,
              'url', d.url_arquivo,
              'tamanho_bytes', d.tamanho_bytes, 
              'formato', d.formato,
              'data_upload', d.data_upload,
              'visualizado_em', d.visualizado_em
            ) ORDER BY d.data_upload DESC
          ) FILTER (WHERE d.id IS NOT NULL), 
          '[]'
        ) AS documentos
      FROM users u
      LEFT JOIN documents d ON u.id = d.user_id ${filterClause}
      WHERE u.id = $1
      GROUP BY u.id;
    `;
        const resultado = await db_1.pool.query(query, params);
        if (resultado.rowCount === 0) {
            return res.status(404).json({ msg: "Cliente não encontrado." });
        }
        return res.json(resultado.rows[0]);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao carregar detalhes." });
    }
});
// ======================================================
// 6. CONFIRMAÇÃO DE LEITURA (Novo)
// ======================================================
router.patch('/documents/:id/visualizar', auth_1.verificarToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db_1.pool.query(`UPDATE documents 
         SET visualizado_em = NOW() 
         WHERE id = $1 AND user_id = $2`, [id, req.userId]);
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
        // 1. Segurança: Só Admin
        const usuario = await db_1.pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
        if (usuario.rows[0].tipo_usuario !== 'admin') {
            return res.status(403).json({ msg: "Acesso negado." });
        }
        // 2. Total de Clientes Ativos
        const totalClientes = await db_1.pool.query("SELECT COUNT(*) FROM users WHERE tipo_usuario = 'cliente'");
        // 3. Documentos Enviados este Mês
        const docsMes = await db_1.pool.query(`
      SELECT COUNT(*) FROM documents 
      WHERE EXTRACT(MONTH FROM data_upload) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM data_upload) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);
        // 4. Taxa de Leitura Global (Quantos % foram vistos?)
        const leituraStats = await db_1.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(visualizado_em) as visualizados
      FROM documents
    `);
        const totalDocs = parseInt(leituraStats.rows[0].total) || 0;
        const visualizados = parseInt(leituraStats.rows[0].visualizados) || 0;
        const taxaLeitura = totalDocs === 0 ? 0 : Math.round((visualizados / totalDocs) * 100);
        // 5. Últimos 5 Documentos NÃO LIDOS (Pendências)
        const pendencias = await db_1.pool.query(`
      SELECT d.id, d.titulo, d.data_upload, u.nome as cliente_nome
      FROM documents d
      JOIN users u ON d.user_id = u.id
      WHERE d.visualizado_em IS NULL
      ORDER BY d.data_upload DESC
      LIMIT 5
    `);
        return res.json({
            clientesAtivos: totalClientes.rows[0].count,
            uploadsMes: docsMes.rows[0].count,
            taxaLeitura: taxaLeitura,
            pendencias: pendencias.rows
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao carregar dashboard." });
    }
});
exports.default = router;
