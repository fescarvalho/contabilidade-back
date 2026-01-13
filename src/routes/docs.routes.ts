import { Router, Response } from 'express';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import { verificarToken, AuthRequest } from '../middlewares/auth';
import { pool } from '../db'; // <--- IMPORTAMOS AQUI

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// LISTAR (GET)
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

// UPLOAD (POST)
router.post('/upload', verificarToken, upload.single('arquivo'), async (req: AuthRequest, res: Response) => {
  try {
    // 1. Validação: Só Admin pode entrar aqui
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
        return res.status(403).json({ msg: "Acesso negado. Apenas admins." });
    }

    // 2. AQUI ELE VOLTOU! Pegamos o ID do cliente alvo pelo formulário <<<
    const { cliente_id, titulo } = req.body; 
    const file = req.file;

    // 3. Validamos se você não esqueceu de mandar o ID <<<
    if (!cliente_id) return res.status(400).json({ msg: "Faltou informar o ID do cliente!" });
    if (!file) return res.status(400).json({ msg: "Arquivo obrigatório." });

    const checkCliente = await pool.query('SELECT id, nome FROM users WHERE id = $1', [cliente_id]);

    if (checkCliente.rowCount === 0) {
        return res.status(404).json({ 
            msg: `Erro: O cliente com ID ${cliente_id} não existe no sistema.` 
        });
    }
    

    // Se chegou aqui, o cliente existe! Pode fazer o upload.
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

    return res.json({ 
        msg: `Arquivo enviado para ${checkCliente.rows[0].nome} com sucesso!`, 
        documento: novoDoc.rows[0] 
    });

  } catch (err) {
    console.error(err);
    // Se o erro for de formato inválido do ID (ex: texto em vez de numero)
    if ((err as any).code === '22P02') {
        return res.status(400).json({ msg: "O ID do cliente precisa ser um número." });
    }
    return res.status(500).json({ msg: "Erro no servidor" });
  }
});

// ROTA DE DELETAR DOCUMENTO (Somente Admin)
router.delete('/documentos/:id', verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Pega o ID da URL (ex: /documentos/15)

  try {
    // 1. BARREIRA DE SEGURANÇA (Só Admin passa)
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
      return res.status(403).json({ msg: "Acesso negado. Apenas administradores podem deletar arquivos." });
    }

    // 2. BUSCAR O ARQUIVO NO BANCO (Para pegar a URL)
    const documento = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    
    if (documento.rowCount === 0) {
      return res.status(404).json({ msg: "Documento não encontrado." });
    }

    const arquivoParaDeletar = documento.rows[0];

    // 3. APAGAR O ARQUIVO FÍSICO NA VERCEL (Importante para economizar espaço!)
    // A função 'del' precisa da URL completa do arquivo
    if (arquivoParaDeletar.url_arquivo) {
        await del(arquivoParaDeletar.url_arquivo, {
            token: process.env.BLOB_READ_WRITE_TOKEN
        });
    }

    // 4. APAGAR O REGISTRO DO BANCO DE DADOS
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    return res.json({ msg: "Documento apagado com sucesso do sistema e da nuvem." });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao deletar documento." });
  }
});


// LISTAR DADOS E DOCUMENTOS DE UM ÚNICO CLIENTE (Detalhes)
router.get('/clientes/:id/documentos', verificarToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Pega o ID da URL (ex: /clientes/5/documentos)

  try {
    // 1. Segurança: Apenas Admin pode ver detalhes de outros
    // (Opcional: Se quiser que o próprio cliente veja os seus, teria que mudar a lógica aqui)
    const usuarioLogado = await pool.query('SELECT tipo_usuario FROM users WHERE id = $1', [req.userId]);
    if (usuarioLogado.rows[0].tipo_usuario !== 'admin') {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    // 2. QUERY FILTRADA POR ID
    const query = `
      SELECT 
        u.id, 
        u.nome, 
        u.email, 
        u.cpf,
        -- Lista de documentos aninhada
        COALESCE(
          json_agg(
            json_build_object(
              'id_doc', d.id,
              'titulo', d.titulo,
              'url', d.url_arquivo
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

    // 3. Validação se o cliente existe
    if (resultado.rowCount === 0) {
      return res.status(404).json({ msg: "Cliente não encontrado." });
    }
    
    // Retorna o primeiro (e único) item do array
    return res.json(resultado.rows[0]);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao carregar detalhes do cliente." });
  }
});
export default router;