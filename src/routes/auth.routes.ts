import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { del } from "@vercel/blob";
import { verificarToken, AuthRequest } from "../middlewares/auth";
import { enviarEmailRecuperacao } from '../services/emailService';

// --- NOVO: IMPORTAÇÕES DO ZOD ---
import { validate } from "../middlewares/validateResource";
import { 
  registerSchema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} from "../schemas/authSchemas";

const router = Router();

// Chave secreta para assinar o token de recuperação
const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_super_secreta_recuperacao";

// ======================================================
// 1. REGISTRO (Agora protegido pelo Zod)
// ======================================================
// Note o uso de 'validate(registerSchema)' aqui na linha abaixo 👇
router.post("/register", validate(registerSchema), async (req: Request, res: Response) => {
  const { nome, email, senha, cpf, telefone } = req.body;

  try {
    // --- NÃO PRECISA MAIS DOS IFs MANUAIS AQUI! ---
    // O Zod já garantiu que nome, email, senha, cpf e telefone existem e são válidos.

    // Só precisamos checar se já existe no banco (regra de negócio)
    const userExist = await pool.query(
      "SELECT email, cpf FROM users WHERE email = $1 OR cpf = $2",
      [email, cpf],
    );

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
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    const novoUsuario = await pool.query(
      `INSERT INTO users (nome, email, senha_hash, cpf, telefone, tipo_usuario) 
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, email, telefone`,
      [nome, email, senhaHash, cpf, telefone, "cliente"],
    );

    return res.json({ msg: "Usuário criado com segurança!", user: novoUsuario.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao cadastrar" });
  }
});

// ======================================================
// 2. LOGIN (Agora protegido pelo Zod)
// ======================================================
router.post("/login", validate(loginSchema), async (req: Request, res: Response) => {
  const { email, senha } = req.body;

  try {
    const result: any = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows ? result.rows[0] : result[0];

    if (!user) {
      return res.status(400).json({ msg: "E-mail ou senha incorretos." });
    }
  
    const senhaBate = await bcrypt.compare(senha, user.senha_hash);

    if (!senhaBate) {
      return res.status(400).json({ msg: "E-mail ou senha incorretos." });
    }

    const secret = process.env.JWT_SECRET || "segredo_padrao_teste";
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: "1h" });

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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro no servidor" });
  }
});

// ======================================================
// 3. LISTAR CLIENTES (Admin)
// ======================================================
router.get("/clientes", verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
      req.userId,
    ]);
    if (user.rows[0].tipo_usuario !== "admin")
      return res.status(403).json({ msg: "Acesso negado" });

    const resultado = await pool.query(
      "SELECT id, nome, email, cpf, telefone FROM users WHERE tipo_usuario = $1 ORDER BY nome ASC",
      ["cliente"],
    );

    return res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao listar clientes" });
  }
});

// ======================================================
// 4. DELETAR USUÁRIO
// ======================================================
router.delete("/users/:id", verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const solicitanteId = req.userId;
  try {
    const solicitante = await pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
      req.userId,
    ]);
    if (solicitante.rows.length === 0 || solicitante.rows[0].tipo_usuario !== "admin") {
      return res.status(403).json({ msg: "Acesso negado. Apenas administradores." });
    }

    if (id === String(solicitanteId)) {
      return res.status(400).json({ msg: "Você não pode deletar sua própria conta." });
    }

    const arquivosDoCliente = await pool.query(
      "SELECT url_arquivo FROM documents WHERE user_id = $1",
      [id],
    );

    for (const doc of arquivosDoCliente.rows) {
      if (doc.url_arquivo) {
        try {
          await del(doc.url_arquivo, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (error) {
          console.error(`Erro ao apagar arquivo ${doc.url_arquivo}:`, error);
        }
      }
    }

    await pool.query("DELETE FROM documents WHERE user_id = $1", [id]);

    const deleteUser = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING nome",
      [id],
    );

    if (deleteUser.rowCount === 0) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }

    return res.json({
      msg: `Usuário ${deleteUser.rows[0].nome} e todos os seus arquivos foram removidos com sucesso.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao deletar usuário." });
  }
});

// ======================================================
// 5. ATUALIZAR USUÁRIO
// ======================================================
router.put("/users/:id", verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { nome, email, cpf, telefone } = req.body;

  try {
    const adminCheck = await pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
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

    const updatedUser = await pool.query(updateQuery, [nome, email, cpf, telefone, id]);

    if (updatedUser.rowCount === 0) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }

    return res.json({
      msg: "Dados atualizados com sucesso!",
      user: updatedUser.rows[0],
    });
  } catch (err) {
    console.error(err);
    if ((err as any).code === "23505") {
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
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const { email } = req.body;

  try {
    const result: any = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows ? result.rows[0] : result[0];

    if (!user) {
      return res.status(404).json({ msg: "E-mail não encontrado." });
    }

    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    const link = `https://leandro-abreu-contabilidade.vercel.app/redefinir-senha?token=${token}`;

    console.log(`Enviando para ${email}...`);
    
    const sucesso = await enviarEmailRecuperacao(email, link);

    if (sucesso) {
        return res.json({ msg: "Link de recuperação enviado para seu e-mail!" });
    } else {
        return res.status(500).json({ msg: "Erro ao enviar e-mail. Tente novamente mais tarde." });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: "Erro interno." });
  }
});

// ======================================================
// 7. RESETAR SENHA (Agora protegido pelo Zod)
// ======================================================
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    // 1. Valida Token e Pega Email
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    // 2. Criptografa Nova Senha
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    // 3. Atualiza Banco
    await pool.query(
        "UPDATE users SET senha_hash = $1 WHERE email = $2",
        [hash, email]
    );
    
    return res.json({ msg: "Senha alterada com sucesso!" });

  } catch (error) {
    console.error("❌ ERRO NO RESET:", error);
    return res.status(400).json({ msg: "O link expirou ou é inválido. Peça um novo." });
  }
});

export default router;