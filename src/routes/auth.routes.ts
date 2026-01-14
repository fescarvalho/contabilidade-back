import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { v4 as uuidv4 } from 'uuid';
import { del } from "@vercel/blob";
import { verificarToken, AuthRequest } from "../middlewares/auth";
import { enviarEmailRecuperacao } from '../services/emailService';

const router = Router();
const resetTokens = new Map();

router.post("/register", async (req: Request, res: Response) => {
  const { nome, email, senha, cpf, telefone } = req.body;

  try {
    if (
      !nome?.trim() ||
      !email?.trim() ||
      !senha?.trim() ||
      !cpf?.trim() ||
      !telefone?.trim()
    ) {
      return res.status(400).json({
        msg: "Todos os campos (nome, email, senha, cpf, telefone) são obrigatórios.",
      });
    }
    const userExist = await pool.query(
      "SELECT email, cpf FROM users WHERE email = $1 OR cpf = $2",
      [email, cpf],
    );

    if (userExist.rows.length > 0) {
      // Se encontrou algo, vamos descobrir exatamente o que foi para avisar o utilizador
      const encontrado = userExist.rows[0];

      if (encontrado.email === email) {
        return res
          .status(400)
          .json({ msg: "Este e-mail já está em uso por outra conta." });
      }

      if (encontrado.cpf === cpf) {
        return res.status(400).json({ msg: "Este CPF já está cadastrado no sistema." });
      }
    }

    const senhaForteRegex = /^(?=.*\d)(?=.*[\W_]).{6,}$/;

    if (!senhaForteRegex.test(senha)) {
      return res.status(400).json({
        msg: "A senha é muito fraca. Ela deve ter no mínimo 6 caracteres, 1 número e 1 símbolo.",
      });
    }

    // --- 3. Cria o Hash e Salva ---
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

router.post("/login", async (req: Request, res: Response) => {
  const { email, senha } = req.body;

  try {
    const result: any = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows ? result.rows[0] : result[0];

    if (!user) {
      return res.status(400).json({ msg: "E-mail ou senha incorretos." });
    }
    console.log("📦 O QUE VEIO DO BANCO:", user);
  
    const senhaBate = await bcrypt.compare(senha, user.senha_hash);

    if (!senhaBate) {
      return res.status(400).json({ msg: "E-mail ou senha incorretos." });
    }

    const secret = process.env.JWT_SECRET || "segredo_padrao_teste";
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: "1h" });

    // AQUI ESTÁ O SEU PEDIDO: Retornando o CPF no JSON
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

// LISTAR TODOS OS CLIENTES (Apenas para o escritório)
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

// DELETAR USUÁRIO (E TODOS SEUS ARQUIVOS)
router.delete("/users/:id", verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const solicitanteId = req.userId;
  try {
    // 1. SEGURANÇA: Só Admin pode deletar
    const solicitante = await pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
      req.userId,
    ]);
    if (solicitante.rows.length === 0 || solicitante.rows[0].tipo_usuario !== "admin") {
      return res.status(403).json({ msg: "Acesso negado. Apenas administradores." });
    }

    if (id === String(solicitanteId)) {
      return res.status(400).json({ msg: "Você não pode deletar sua própria conta." });
    }

    // 3. LIMPEZA PROFUNDA: Buscar arquivos desse cliente para apagar da Vercel
    const arquivosDoCliente = await pool.query(
      "SELECT url_arquivo FROM documents WHERE user_id = $1",
      [id],
    );

    // Loop para apagar cada arquivo da nuvem (Vercel Blob)
    for (const doc of arquivosDoCliente.rows) {
      if (doc.url_arquivo) {
        try {
          await del(doc.url_arquivo, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (error) {
          console.error(`Erro ao apagar arquivo ${doc.url_arquivo}:`, error);
          // Continuamos o fluxo mesmo se um arquivo der erro, para não travar a deleção do usuário
        }
      }
    }

    // 4. APAGAR DADOS DO BANCO
    // Primeiro removemos os registros de documentos (se não houver CASCADE configurado no banco)
    await pool.query("DELETE FROM documents WHERE user_id = $1", [id]);

    // Finalmente, removemos o usuário
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

// ATUALIZAR DADOS DO USUÁRIO (Admin Editando Cliente)
router.put("/users/:id", verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { nome, email, cpf, telefone } = req.body;

  try {
    // 1. SEGURANÇA: Só Admin pode editar
    const adminCheck = await pool.query("SELECT tipo_usuario FROM users WHERE id = $1", [
      req.userId,
    ]);
    if (adminCheck.rows[0].tipo_usuario !== "admin") {
      return res
        .status(403)
        .json({ msg: "Acesso negado. Apenas administradores podem editar usuários." });
    }

    // 2. ATUALIZAÇÃO NO BANCO
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
    // Tratamento para evitar duplicidade (ex: tentar usar um email que já é de outro)
    if ((err as any).code === "23505") {
      return res
        .status(400)
        .json({ msg: "Erro: Email ou CPF já cadastrado em outra conta." });
    }
    return res.status(500).json({ msg: "Erro ao atualizar usuário." });
  }
});

// Rota: /forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
   
    const result: any = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows ? result.rows[0] : result[0];

    if (!user) {
      return res.status(404).json({ msg: "E-mail não encontrado." });
    }

    // 2. Gera Token
    const token = uuidv4();
    resetTokens.set(token, { email, expires: Date.now() + 3600000 });

    const link = `https://leandro-abreu-contabilidade.vercel.app/redefinir-senha?token=${token}`;

    // 3. ENVIA PELO RESEND
    console.log(`Enviando para ${email} via Resend...`);
    
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

// Rota: /reset-password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  const resetData = resetTokens.get(token);

  if (!resetData || resetData.expires < Date.now()) {
    return res.status(400).json({ msg: "Token inválido ou expirado." });
  }
 
  try {
   
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

   
    await pool.query(
        "UPDATE users SET senha = $1 WHERE email = $2",
        [hash, resetData.email]
    );

  
    resetTokens.delete(token); 
    
    return res.json({ msg: "Senha alterada com sucesso!" });

} catch (error) {
    console.error("Erro ao atualizar senha:", error);
    return res.status(500).json({ msg: "Erro ao salvar nova senha." });
}
  


});
export default router;
