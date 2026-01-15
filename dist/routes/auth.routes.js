"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const blob_1 = require("@vercel/blob");
const auth_1 = require("../middlewares/auth");
const emailService_1 = require("../services/emailService");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// --- NOVO: IMPORTAÇÕES DO ZOD ---
const validateResource_1 = require("../middlewares/validateResource");
const authSchemas_1 = require("../schemas/authSchemas");
const router = (0, express_1.Router)();
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Só permite 5 tentativas erradas por IP
    message: "Muitas tentativas de login. Conta bloqueada temporariamente por 15 minutos."
});
// Chave secreta para assinar o token de recuperação
const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_super_secreta_recuperacao";
// ======================================================
// 1. REGISTRO (Agora protegido pelo Zod)
// ======================================================
// Note o uso de 'validate(registerSchema)' aqui na linha abaixo 👇
router.post("/register", (0, validateResource_1.validate)(authSchemas_1.registerSchema), async (req, res) => {
    const { nome, email, senha, cpf, telefone } = req.body;
    try {
        // --- NÃO PRECISA MAIS DOS IFs MANUAIS AQUI! ---
        // O Zod já garantiu que nome, email, senha, cpf e telefone existem e são válidos.
        // Só precisamos checar se já existe no banco (regra de negócio)
        const userExist = await db_1.pool.query("SELECT email, cpf FROM users WHERE email = $1 OR cpf = $2", [email, cpf]);
        if (userExist.rows.length > 0) {
            const encontrado = userExist.rows[0];
            if (encontrado.email === email) {
                return res.status(400).json({ msg: "Este e-mail já está em uso por outra conta." });
            }
            if (encontrado.cpf === cpf) {
                return res.status(400).json({ msg: "Este CPF já está cadastrado no sistema." });
            }
        }
        // A validação de senha forte (Regex) também já foi feita pelo Zod!
        // --- Cria o Hash e Salva ---
        const salt = await bcryptjs_1.default.genSalt(10);
        const senhaHash = await bcryptjs_1.default.hash(senha, salt);
        const novoUsuario = await db_1.pool.query(`INSERT INTO users (nome, email, senha_hash, cpf, telefone, tipo_usuario) 
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, email, telefone`, [nome, email, senhaHash, cpf, telefone, "cliente"]);
        return res.json({ msg: "Usuário criado com segurança!", user: novoUsuario.rows[0] });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao cadastrar" });
    }
});
// ======================================================
// 2. LOGIN (Agora protegido pelo Zod)
// ======================================================
router.post("/login", (0, validateResource_1.validate)(authSchemas_1.loginSchema), loginLimiter, async (req, res) => {
    const { email, senha } = req.body;
    try {
        const result = await db_1.pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = result.rows ? result.rows[0] : result[0];
        if (!user) {
            return res.status(400).json({ msg: "E-mail ou senha incorretos." });
        }
        const senhaBate = await bcryptjs_1.default.compare(senha, user.senha_hash);
        if (!senhaBate) {
            return res.status(400).json({ msg: "E-mail ou senha incorretos." });
        }
        const secret = process.env.JWT_SECRET || "segredo_padrao_teste";
        const token = jsonwebtoken_1.default.sign({ id: user.id }, secret, { expiresIn: "1h" });
        return res.json({
            msg: "Logado com sucesso!",
            token,
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                cpf: user.cpf,
                tipo_usuario: user.tipo_usuario,
            },
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro no servidor" });
    }
});
// ======================================================
// 3. LISTAR CLIENTES (Admin)
// ======================================================
router.get("/clientes", auth_1.verificarToken, async (req, res) => {
    try {
        const user = await db_1.pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
            req.userId,
        ]);
        if (user.rows[0].tipo_usuario !== "admin")
            return res.status(403).json({ msg: "Acesso negado" });
        const resultado = await db_1.pool.query("SELECT id, nome, email, cpf, telefone FROM users WHERE tipo_usuario = $1 ORDER BY nome ASC", ["cliente"]);
        return res.json(resultado.rows);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao listar clientes" });
    }
});
// ======================================================
// 4. DELETAR USUÁRIO
// ======================================================
router.delete("/users/:id", auth_1.verificarToken, async (req, res) => {
    const { id } = req.params;
    const solicitanteId = req.userId;
    try {
        const solicitante = await db_1.pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
            req.userId,
        ]);
        if (solicitante.rows.length === 0 || solicitante.rows[0].tipo_usuario !== "admin") {
            return res.status(403).json({ msg: "Acesso negado. Apenas administradores." });
        }
        if (id === String(solicitanteId)) {
            return res.status(400).json({ msg: "Você não pode deletar sua própria conta." });
        }
        const arquivosDoCliente = await db_1.pool.query("SELECT url_arquivo FROM documents WHERE user_id = $1", [id]);
        for (const doc of arquivosDoCliente.rows) {
            if (doc.url_arquivo) {
                try {
                    await (0, blob_1.del)(doc.url_arquivo, { token: process.env.BLOB_READ_WRITE_TOKEN });
                }
                catch (error) {
                    console.error(`Erro ao apagar arquivo ${doc.url_arquivo}:`, error);
                }
            }
        }
        await db_1.pool.query("DELETE FROM documents WHERE user_id = $1", [id]);
        const deleteUser = await db_1.pool.query("DELETE FROM users WHERE id = $1 RETURNING nome", [id]);
        if (deleteUser.rowCount === 0) {
            return res.status(404).json({ msg: "Usuário não encontrado." });
        }
        return res.json({
            msg: `Usuário ${deleteUser.rows[0].nome} e todos os seus arquivos foram removidos com sucesso.`,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Erro ao deletar usuário." });
    }
});
// ======================================================
// 5. ATUALIZAR USUÁRIO
// ======================================================
router.put("/users/:id", auth_1.verificarToken, async (req, res) => {
    const { id } = req.params;
    const { nome, email, cpf, telefone } = req.body;
    try {
        const adminCheck = await db_1.pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
            req.userId,
        ]);
        if (adminCheck.rows[0].tipo_usuario !== "admin") {
            return res
                .status(403)
                .json({ msg: "Acesso negado. Apenas administradores podem editar usuários." });
        }
        const updateQuery = `
      UPDATE users 
      SET nome = $1, email = $2, cpf = $3, telefone = $4
      WHERE id = $5
      RETURNING id, nome, email, cpf, telefone, tipo_usuario
    `;
        const updatedUser = await db_1.pool.query(updateQuery, [nome, email, cpf, telefone, id]);
        if (updatedUser.rowCount === 0) {
            return res.status(404).json({ msg: "Usuário não encontrado." });
        }
        return res.json({
            msg: "Dados atualizados com sucesso!",
            user: updatedUser.rows[0],
        });
    }
    catch (err) {
        console.error(err);
        if (err.code === "23505") {
            return res
                .status(400)
                .json({ msg: "Erro: Email ou CPF já cadastrado em outra conta." });
        }
        return res.status(500).json({ msg: "Erro ao atualizar usuário." });
    }
});
// ======================================================
// 6. ESQUECI A SENHA (Agora protegido pelo Zod)
// ======================================================
router.post('/forgot-password', (0, validateResource_1.validate)(authSchemas_1.forgotPasswordSchema), async (req, res) => {
    const { email } = req.body;
    try {
        const result = await db_1.pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = result.rows ? result.rows[0] : result[0];
        if (!user) {
            return res.status(404).json({ msg: "E-mail não encontrado." });
        }
        const token = jsonwebtoken_1.default.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        const link = `https://leandro-abreu-contabilidade.vercel.app/redefinir-senha?token=${token}`;
        console.log(`Enviando para ${email}...`);
        const sucesso = await (0, emailService_1.enviarEmailRecuperacao)(email, link);
        if (sucesso) {
            return res.json({ msg: "Link de recuperação enviado para seu e-mail!" });
        }
        else {
            return res.status(500).json({ msg: "Erro ao enviar e-mail. Tente novamente mais tarde." });
        }
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ msg: "Erro interno." });
    }
});
// ======================================================
// 7. RESETAR SENHA (Agora protegido pelo Zod)
// ======================================================
router.post('/reset-password', (0, validateResource_1.validate)(authSchemas_1.resetPasswordSchema), async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        // 1. Valida Token e Pega Email
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const email = decoded.email;
        // 2. Criptografa Nova Senha
        const salt = await bcryptjs_1.default.genSalt(10);
        const hash = await bcryptjs_1.default.hash(newPassword, salt);
        // 3. Atualiza Banco
        await db_1.pool.query("UPDATE users SET senha_hash = $1 WHERE email = $2", [hash, email]);
        return res.json({ msg: "Senha alterada com sucesso!" });
    }
    catch (error) {
        console.error("❌ ERRO NO RESET:", error);
        return res.status(400).json({ msg: "O link expirou ou é inválido. Peça um novo." });
    }
});
exports.default = router;
