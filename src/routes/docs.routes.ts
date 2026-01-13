// src/routes/docs.routes.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import { put } from "@vercel/blob";
import { db } from "../db";
import { verificarToken, AuthRequest } from "../middlewares/authMiddleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Rota de Listar (GET)
router.get(
  "/meus-documentos",
  verificarToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const resultado = await db.query(
        "SELECT * FROM documents WHERE user_id = $1 ORDER BY data_upload DESC",
        [req.userId],
      );
      return res.json(resultado.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erro ao buscar documentos" });
    }
  },
);

// Rota de Upload (POST)
router.post("/upload", upload.single("arquivo"), async (req: Request, res: Response) => {
  const { cliente_id, titulo } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ msg: "Nenhum arquivo enviado!" });
  if (!cliente_id || !titulo) return res.status(400).json({ msg: "Faltou dados!" });

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error("Token do Blob não configurado");
    }

    const blob = await put(file.originalname, file.buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const novoDoc = await db.query(
      "INSERT INTO documents (user_id, titulo, url_arquivo) VALUES ($1, $2, $3) RETURNING *",
      [cliente_id, titulo, blob.url],
    );

    return res.json({
      msg: "Arquivo enviado com sucesso!",
      documento: novoDoc.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro ao fazer upload" });
  }
});

export default router;
