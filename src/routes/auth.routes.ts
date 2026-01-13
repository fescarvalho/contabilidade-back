import { Router, Request, Response } from "express";
import { db } from "../db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  const { email, senha } = req.body;

  try {
    const resultado = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const usuario = resultado.rows[0];

    if (!usuario) {
      return res.status(400).json({ msg: "Usuário não encontrado" });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(400).json({ msg: "Senha incorreta" });
    }

    const secret = process.env.JWT_SECRET as string;
    const token = jwt.sign({ id: usuario.id }, secret, { expiresIn: "1h" });

    return res.json({
      msg: "Logado com sucesso!",
      token,
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erro no servidor" });
  }
});

export default router;
