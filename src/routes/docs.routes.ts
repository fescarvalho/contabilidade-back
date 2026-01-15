import { Router, Response } from 'express';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import { pool } from '../db';
import { enviarEmailNovoDocumento } from '../services/emailService';
import { verificarToken, AuthRequest } from '../middlewares/auth';

// --- NOVOS IMPORTS ---
import { validate } from '../middlewares/validateResource';
import { 
  uploadSchema, 
  deleteDocumentSchema, 
  searchClientSchema, 
  getClientDetailsSchema 
} from '../schemas/docSchemas';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (Cliente Logado)
// ======================================================
// Não precisa de Zod aqui pois só usa o token
router.get('/meus-documentos', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const resultado = await pool.query(
      `SELECT id, user_id, titulo, url_arquivo, nome_original, tamanho_bytes, formato, data_upload 
       FROM documents WHERE user_id = $1 ORDER BY data_upload DESC`,
      [req.userId]
    );
    return res.json(resultado.rows);
  } catch (err) {
    return res.status(500).json({ msg: "Erro ao buscar documentos" });
  }
});

// ======================================================
// 2. UPLOAD (POST) - Com Zod e Multer
// ======================================================
// ORDEM IMPORTANTE: 1. Token -> 2. Multer (Lê o arquivo) -> 3. Zod (Valida os textos)
router.post(
  '/upload', 
  verificarToken, 
  upload.single('arquivo'), 
  validate(uploadSchema), 
  async (req: AuthRequest, res: Response) => {
  
  try {
    // 1. Validação: Só Admin pode enviar
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
        return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
    }

    const { cliente_id, titulo } = req.body; 
    const file = req.file;

    if (!file) return res.status(400).json({ msg: "Selecione um arquivo para enviar." });

    // ✅ CORREÇÃO AQUI: Adicionamos ', email' no SELECT
    const checkCliente = await pool.query(
        'SELECT id, nome, email FROM users WHERE id = $1', 
        [cliente_id]
    );

    if (checkCliente.rowCount === 0) {
        return res.status(404).json({ 
            msg: `Erro: O cliente com ID ${cliente_id} não existe.` 
        });
    }

    // Upload para a Vercel Blob
    const blob = await put(file.originalname, file.buffer, { 
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: true
    });

    // Salva no banco
    const novoDoc = await pool.query(
        `INSERT INTO documents 
        (user_id, titulo, url_arquivo, nome_original, tamanho_bytes, formato) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *`,
        [cliente_id, titulo, blob.url, file.originalname, file.size, file.mimetype]
    );

    // ✅ ENVIO DE E-MAIL SEGURO
    const dadosCliente = checkCliente.rows[0];
    
    // Só tenta enviar se o email existir (evita o erro "No recipients defined")
    if (dadosCliente.email) {
        try {
            console.log(`Enviando aviso para ${dadosCliente.email}...`);
            await enviarEmailNovoDocumento(dadosCliente.email, dadosCliente.nome, titulo);
            console.log("Aviso enviado.");
        } catch (emailErr) {
            console.error("Erro no envio de email (ignorado para não travar upload):", emailErr);
        }
    } else {
        console.warn(`Cliente ${dadosCliente.nome} não tem e-mail cadastrado. Aviso não enviado.`);
    }

    return res.json({ 
        msg: `Arquivo enviado para ${dadosCliente.nome} com sucesso!`, 
        documento: novoDoc.rows[0] 
    });
  
  } catch (err) {
    console.error(err);
    if ((err as any).code === '22P02') {
        return res.status(400).json({ msg: "O ID do cliente precisa ser um número." });
    }
    return res.status(500).json({ msg: "Erro no servidor" });
  }
});
// ======================================================
// 3. DELETAR DOCUMENTO (Somente Admin)
// ======================================================
router.delete('/documentos/:id', verificarToken, validate(deleteDocumentSchema), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    const documento = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    
    if (documento.rowCount === 0) {
      return res.status(404).json({ msg: "Documento não encontrado." });
    }

    const arquivoParaDeletar = documento.rows[0];

    // Apagar da Vercel
    if (arquivoParaDeletar.url_arquivo) {
        try {
            await del(arquivoParaDeletar.url_arquivo, {
                token: process.env.BLOB_READ_WRITE_TOKEN
            });
        } catch (error) {
            console.error("Erro ao apagar do Blob (pode já ter sido apagado):", error);
        }
    }

    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

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
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    const resultado = await pool.query(
      `SELECT id, nome, email, cpf, telefone 
       FROM users 
       WHERE tipo_usuario = 'cliente' 
       AND nome ILIKE $1 
       ORDER BY nome ASC`,
      [`%${nome}%`]
    );
    
    if (resultado.rows.length === 0) {
        return res.status(404).json({ msg: "Nenhum cliente encontrado." });
    }

    return res.json(resultado.rows);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao buscar cliente." });
  }
});

// ======================================================
// 5. DETALHES DE UM CLIENTE + DOCUMENTOS
// ======================================================
router.get('/clientes/:id/documentos', verificarToken, validate(getClientDetailsSchema), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
      return res.status(403).json({ msg: "Acesso negado." });
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
              'data_upload', d.data_upload
            ) 
          ) FILTER (WHERE d.id IS NOT NULL), 
          '[]'
        ) AS documentos
      FROM users u
      LEFT JOIN documents d ON u.id = d.user_id
      WHERE u.id = $1
      GROUP BY u.id;
    `;

    const resultado = await pool.query(query, [id]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ msg: "Cliente não encontrado." });
    }
    
    return res.json(resultado.rows[0]);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao carregar detalhes." });
  }
});

export default router;