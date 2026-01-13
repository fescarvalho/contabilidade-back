import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db'; // <--- IMPORTAMOS AQUI
// Adicione esta linha nos imports (Verifique o caminho ../middlewares/auth)
import { verificarToken, AuthRequest } from '../middlewares/auth';
const router = Router();


router.post('/register', async (req: Request, res: Response) => {
  const { nome, email, senha, cpf, telefone } = req.body;

  try {
    if (!nome?.trim() || !email?.trim() || !senha?.trim() || !cpf?.trim() || !telefone?.trim()) {
      return res.status(400).json({ 
        msg: "Todos os campos (nome, email, senha, cpf, telefone) são obrigatórios." 
      });
    }
    const userExist = await pool.query(
      'SELECT email, cpf FROM users WHERE email = $1 OR cpf = $2', 
      [email, cpf]
    );
  
      if (userExist.rows.length > 0) {
      // Se encontrou algo, vamos descobrir exatamente o que foi para avisar o utilizador
      const encontrado = userExist.rows[0];
      
      if (encontrado.email === email) {
        return res.status(400).json({ msg: "Este e-mail já está em uso por outra conta." });
      }
      
      if (encontrado.cpf === cpf) {
        return res.status(400).json({ msg: "Este CPF já está cadastrado no sistema." });
      }
    }
  
      const senhaForteRegex = /^(?=.*\d)(?=.*[\W_]).{6,}$/;

      if (!senhaForteRegex.test(senha)) {
        return res.status(400).json({ 
            msg: "A senha é muito fraca. Ela deve ter no mínimo 6 caracteres, 1 número e 1 símbolo." 
        });
      }

    // --- 3. Cria o Hash e Salva ---
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);

      const novoUsuario = await pool.query(
        `INSERT INTO users (nome, email, senha_hash, cpf, telefone, tipo_usuario) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, email, telefone`,
        [nome, email, senhaHash, cpf, telefone, 'cliente'] 
      );

      return res.json({ msg: "Usuário criado com segurança!", user: novoUsuario.rows[0] });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao cadastrar" });
  }
});
router.post('/login', async (req: Request, res: Response) => {
  const { email, senha } = req.body;
  
  try {
   
 
    const resultado = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const usuario = resultado.rows[0];

    if (!usuario) return res.status(400).json({ msg: "Usuário não encontrado" });

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    
    if (!senhaValida) return res.status(400).json({ msg: "Senha incorreta" });

    const secret = process.env.JWT_SECRET || 'segredo_padrao_teste';
    const token = jwt.sign({ id: usuario.id }, secret, { expiresIn: '1h' });

    // AQUI ESTÁ O SEU PEDIDO: Retornando o CPF no JSON
    return res.json({
      msg: "Logado com sucesso!",
      token,
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        cpf: usuario.cpf,
        tipo_usuario: usuario.tipo_usuario
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro no servidor" });
  }
});

// LISTAR TODOS OS CLIENTES (Apenas para o escritório)
router.get('/clientes', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
 
     const user = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
     if (user.rows[0].tipo_usuario !== 'admin') return res.status(403).json({ msg: "Acesso negado" });

     const resultado = await pool.query(
      'SELECT id, nome, email, cpf, telefone FROM users WHERE tipo_usuario = $1 ORDER BY nome ASC',
      ['cliente']
    );
    
    return res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao listar clientes" });
  }
});
export default router;