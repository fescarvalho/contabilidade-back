import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: number;
}

export const verificarToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ msg: "Acesso negado!" });

  try {
    const secret = process.env.JWT_SECRET || 'segredo_padrao_teste'; // Fallback para teste
    const decoded = jwt.verify(token, secret) as { id: number };
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(403).json({ msg: "Token inválido" });
  }
};