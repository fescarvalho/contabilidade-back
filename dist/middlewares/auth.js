"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificarToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.status(401).json({ msg: "Acesso negado!" });
    try {
        const secret = process.env.JWT_SECRET || 'segredo_padrao_teste'; // Fallback para teste
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        req.userId = decoded.id;
        next();
    }
    catch (error) {
        return res.status(403).json({ msg: "Token inválido" });
    }
};
exports.verificarToken = verificarToken;
