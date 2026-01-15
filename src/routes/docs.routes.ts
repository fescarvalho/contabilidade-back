import { Router, Response } from 'express';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import { pool } from '../db';
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

// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (Cliente Logado)
// ======================================================
// ======================================================
// 1. LISTAR MEUS DOCUMENTOS (COM FILTRO DE DATA)
// ======================================================
router.get('/meus-documentos', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query; // Pega da URL: ?month=01&year=2026

    let query = `
      SELECT id, user_id, titulo, url_arquivo, nome_original, tamanho_bytes, formato, data_upload, visualizado_em 
      FROM documents 
      WHERE user_id = $1
    `;
    const params: any[] = [req.userId];

    // Se tiver mês E ano, aplica o filtro
    if (month && year) {
        // $2 e $3 serão o mês e o ano
        query += ` AND EXTRACT(MONTH FROM data_upload) = $2 AND EXTRACT(YEAR FROM data_upload) = $3`;
        params.push(month, year);
    }

    query += ` ORDER BY data_upload DESC`;

    const resultado = await pool.query(query, params);
    return res.json(resultado.rows);

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
    // 1. Validação: Só Admin pode enviar
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
        return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
    }

    const { cliente_id, titulo } = req.body; 
    const file = req.file;

    if (!file) return res.status(400).json({ msg: "Selecione um arquivo para enviar." });

    // ✅ Verifica se o cliente existe e pega o EMAIL
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

    // Salva no banco (Agora inclui visualizado_em como NULL por padrão, mas é bom garantir na query se não tiver default no banco)
    const novoDoc = await pool.query(
        `INSERT INTO documents 
        (user_id, titulo, url_arquivo, nome_original, tamanho_bytes, formato) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *`,
        [cliente_id, titulo, blob.url, file.originalname, file.size, file.mimetype]
    );

    // ✅ ENVIO DE E-MAIL SEGURO
    const dadosCliente = checkCliente.rows[0];
    
    if (dadosCliente.email) {
        try {
            console.log(`Enviando aviso para ${dadosCliente.email}...`);
            // O await aqui é opcional se não quiser travar a resposta, mas garante o log correto
            enviarEmailNovoDocumento(dadosCliente.email, dadosCliente.nome, titulo)
                .then(() => console.log("Aviso enviado."))
                .catch(err => console.error("Erro assíncrono no envio:", err));
        } catch (emailErr) {
            console.error("Erro no envio de email:", emailErr);
        }
    } else {
        console.warn(`Cliente ${dadosCliente.nome} não tem e-mail cadastrado.`);
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
            console.error("Erro ao apagar do Blob:", error);
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
    
    
    return res.json(resultado.rows);

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
  const { month, year } = req.query; // Captura os filtros da URL

  try {
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    // Prepara os parâmetros da query
    const params: any[] = [id];
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

    const resultado = await pool.query(query, params);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ msg: "Cliente não encontrado." });
    }
    
    return res.json(resultado.rows[0]);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao carregar detalhes." });
  }
});
// ======================================================
// 6. CONFIRMAÇÃO DE LEITURA (Novo)
// ======================================================
router.patch('/documents/:id/visualizar', verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  
  try {

    await pool.query(
        `UPDATE documents 
         SET visualizado_em = NOW() 
         WHERE id = $1 AND user_id = $2`, 
        [id, req.userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao marcar visualização:", err);
    return res.status(500).json({ msg: "Erro ao registrar leitura" });
  }
});

export default router;